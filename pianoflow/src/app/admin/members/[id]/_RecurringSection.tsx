"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Weekday } from "@/generated/prisma/enums";
import { SLOT_HOURS } from "@/lib/slots";
import {
  createRecurringAction,
  deactivateRecurringAction,
  deleteRecurringAction,
} from "@/actions/recurring";

const WEEKDAY_ORDER: Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
  Weekday.SUN,
];

const WEEKDAY_LABEL: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

const SKIP_REASON_LABEL: Record<string, string> = {
  NO_AVAILABILITY: "해당 주 선생님 스케줄에 없는 시간",
  STUDENT_INACTIVE: "학생이 활성 상태가 아님",
  ENROLLMENT_OUT: "등록 기간 밖",
  DUPLICATE: "학생이 같은 시각에 이미 예약 보유",
  SLOT_TAKEN: "다른 예약이 슬롯을 선점",
};

export interface TeacherOption {
  id: string;
  name: string;
  availability: { weekday: Weekday; hours: number[] }[];
}

export interface RecurringRow {
  id: string;
  teacherName: string;
  weekday: Weekday;
  hour: number;
  active: boolean;
}

export function RecurringSection({
  studentId,
  teachers,
  templates,
}: {
  studentId: string;
  teachers: TeacherOption[];
  templates: RecurringRow[];
}) {
  const [teacherId, setTeacherId] = useState<string>("");
  const [weekday, setWeekday] = useState<Weekday | "">("");
  const [hour, setHour] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === teacherId),
    [teachers, teacherId],
  );

  // 선택한 선생님이 실제로 가용한 요일만 노출 → 실체화되지 않을 조합 방지
  const availableWeekdays = useMemo(() => {
    if (!selectedTeacher) return [];
    const set = new Set(
      selectedTeacher.availability
        .filter((a) => a.hours.length > 0)
        .map((a) => a.weekday),
    );
    return WEEKDAY_ORDER.filter((w) => set.has(w));
  }, [selectedTeacher]);

  const availableHours = useMemo(() => {
    if (!selectedTeacher || !weekday) return [];
    const row = selectedTeacher.availability.find((a) => a.weekday === weekday);
    return SLOT_HOURS.filter((h) => row?.hours.includes(h));
  }, [selectedTeacher, weekday]);

  // Select.Value가 id가 아닌 라벨을 표시하도록 값→라벨 맵 제공
  const teacherItems = useMemo(
    () => Object.fromEntries(teachers.map((t) => [t.id, t.name])),
    [teachers],
  );
  const weekdayItems = useMemo(
    () =>
      Object.fromEntries(
        availableWeekdays.map((w) => [w, `${WEEKDAY_LABEL[w]}요일`]),
      ),
    [availableWeekdays],
  );
  const hourItems = useMemo(
    () =>
      Object.fromEntries(
        availableHours.map((h) => [
          String(h),
          `${String(h).padStart(2, "0")}:00`,
        ]),
      ),
    [availableHours],
  );

  function resetForm() {
    setTeacherId("");
    setWeekday("");
    setHour("");
  }

  function submit() {
    if (!teacherId || !weekday || !hour) {
      toast.error("선생님·요일·시간을 모두 선택해주세요.");
      return;
    }
    startTransition(async () => {
      const res = await createRecurringAction({
        studentId,
        teacherId,
        weekday: weekday as Weekday,
        hour: Number(hour),
      });
      if (res.ok) {
        const created = res.data?.created ?? 0;
        const skipped = res.data?.skipped ?? [];
        if (created === 0 && skipped.length > 0) {
          // 대표 사유(가장 많이 발생한 것)를 안내
          const counts = new Map<string, number>();
          for (const s of skipped) {
            counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
          }
          const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
          toast.warning(
            `고정 예약은 등록됐지만 이번 예약 창에는 예약이 생성되지 않았습니다. (사유: ${SKIP_REASON_LABEL[top] ?? top})`,
          );
        } else {
          toast.success(
            `고정 예약이 등록되었습니다. (예약 ${created}건 생성${skipped.length > 0 ? `, ${skipped.length}건 건너뜀` : ""})`,
          );
        }
        resetForm();
      } else {
        toast.error(res.message);
      }
    });
  }

  function deactivate(id: string) {
    startTransition(async () => {
      const res = await deactivateRecurringAction({ id });
      if (res.ok) toast.success("고정 예약을 해제했습니다. (기존 예약은 유지)");
      else toast.error(res.message);
    });
  }

  function remove(id: string) {
    if (!window.confirm("이 고정 예약을 삭제하시겠습니까?")) return;
    const cancelFuture = window.confirm(
      "이미 생성된 앞으로의 예약도 함께 취소할까요?\n\n확인 = 미래 예약까지 취소(레슨 횟수 복구)\n취소 = 예약은 남기고 고정 설정만 삭제",
    );
    startTransition(async () => {
      const res = await deleteRecurringAction({ id, cancelFuture });
      if (res.ok) toast.success("고정 예약을 삭제했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      {/* 등록된 고정 예약 목록 */}
      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          등록된 고정 예약이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="flex items-center gap-2 text-sm">
                <Repeat aria-hidden className="size-4 shrink-0 text-primary/70" />
                <span className="font-medium">
                  매주 {WEEKDAY_LABEL[t.weekday]}요일{" "}
                  {String(t.hour).padStart(2, "0")}:00
                </span>
                <span className="text-muted-foreground">
                  · {t.teacherName} 선생님
                </span>
                {!t.active && <Badge variant="outline">해제됨</Badge>}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {t.active && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => deactivate(t.id)}
                  >
                    해제
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => remove(t.id)}
                  aria-label="삭제"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 신규 등록 폼 */}
      <div className="flex flex-wrap items-end gap-2 border-t pt-4">
        <Select
          items={teacherItems}
          value={teacherId || null}
          onValueChange={(v) => {
            setTeacherId(v ?? "");
            setWeekday("");
            setHour("");
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="선생님" />
          </SelectTrigger>
          <SelectContent>
            {teachers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={weekdayItems}
          value={weekday || null}
          onValueChange={(v) => {
            setWeekday((v as Weekday) ?? "");
            setHour("");
          }}
          disabled={!selectedTeacher}
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="요일" />
          </SelectTrigger>
          <SelectContent>
            {availableWeekdays.map((w) => (
              <SelectItem key={w} value={w}>
                {WEEKDAY_LABEL[w]}요일
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          items={hourItems}
          value={hour || null}
          onValueChange={(v) => setHour(v ?? "")}
          disabled={!weekday}
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="시간" />
          </SelectTrigger>
          <SelectContent>
            {availableHours.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {String(h).padStart(2, "0")}:00
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button onClick={submit} disabled={pending}>
          {pending ? "처리 중..." : "고정 예약 등록"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        고정 예약은 매주 같은 요일·시간에 자동으로 예약됩니다. 선생님의 가용
        요일·시간만 선택할 수 있습니다.
      </p>
    </div>
  );
}
