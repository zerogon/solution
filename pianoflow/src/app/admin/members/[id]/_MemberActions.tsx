"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  adminAdjustCredits,
  adminResetPassword,
  adminSetStatus,
} from "@/actions/members";
import { adminSetEnrollmentPeriod } from "@/actions/enrollment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Role, UserStatus } from "@/generated/prisma/enums";

interface Props {
  id: string;
  role: Role;
  status: UserStatus;
  remainingLessons: number;
  enrollmentStart: string | null;
  enrollmentEnd: string | null;
}

export function MemberActions({
  id,
  role,
  status,
  remainingLessons,
  enrollmentStart,
  enrollmentEnd,
}: Props) {
  const [delta, setDelta] = useState(0);
  const [memo, setMemo] = useState("");
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [start, setStart] = useState(enrollmentStart ?? "");
  const [end, setEnd] = useState(enrollmentEnd ?? "");
  const [pending, startTransition] = useTransition();

  function saveEnrollment(clear: boolean) {
    startTransition(async () => {
      const res = await adminSetEnrollmentPeriod({
        studentId: id,
        start: clear ? null : start || null,
        end: clear ? null : end || null,
      });
      if (res.ok) {
        if (clear) {
          setStart("");
          setEnd("");
          toast.success("등록 기간이 해제되었습니다.");
        } else {
          toast.success("등록 기간이 저장되었습니다.");
        }
      } else toast.error(res.message);
    });
  }

  function toggleDormant() {
    const next = status === UserStatus.ACTIVE ? UserStatus.DORMANT : UserStatus.ACTIVE;
    startTransition(async () => {
      const res = await adminSetStatus({ id, status: next });
      if (res.ok) toast.success("상태가 변경되었습니다.");
      else toast.error(res.message);
    });
  }

  function withdraw() {
    const confirmed = window.confirm(
      "정말 탈퇴 처리하시겠습니까?\n탈퇴 회원은 로그인과 예약이 차단됩니다. 필요 시 활성화로 복구할 수 있습니다.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const res = await adminSetStatus({ id, status: UserStatus.WITHDRAWN });
      if (res.ok) toast.success("탈퇴 처리되었습니다.");
      else toast.error(res.message);
    });
  }

  function restore() {
    startTransition(async () => {
      const res = await adminSetStatus({ id, status: UserStatus.ACTIVE });
      if (res.ok) toast.success("활성 상태로 복구되었습니다.");
      else toast.error(res.message);
    });
  }

  function applyCredits() {
    if (delta === 0) return;
    startTransition(async () => {
      const res = await adminAdjustCredits({
        studentId: id,
        delta,
        memo: memo || undefined,
      });
      if (res.ok) {
        toast.success("크레딧이 조정되었습니다.");
        setDelta(0);
        setMemo("");
      } else toast.error(res.message);
    });
  }

  function resetPw() {
    startTransition(async () => {
      const res = await adminResetPassword({ id });
      if (res.ok && res.data) {
        setTempPassword(res.data.tempPassword);
        toast.success("비밀번호가 초기화되었습니다.");
      } else if (!res.ok) toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      {tempPassword && (
        <div className="rounded-md border bg-amber-50 p-3 text-sm">
          <p className="font-semibold">초기 비밀번호 (휴대폰 끝 4자리)</p>
          <p className="mt-1 font-mono text-lg text-amber-900">{tempPassword}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status === UserStatus.WITHDRAWN ? (
          <Button variant="outline" onClick={restore} disabled={pending}>
            활성화 (복구)
          </Button>
        ) : (
          <>
            <Button variant="outline" onClick={toggleDormant} disabled={pending}>
              {status === UserStatus.ACTIVE ? "휴면 처리" : "활성화"}
            </Button>
            <Button variant="outline" onClick={resetPw} disabled={pending}>
              비밀번호 초기화
            </Button>
            <Button variant="destructive" onClick={withdraw} disabled={pending}>
              탈퇴 처리
            </Button>
          </>
        )}
      </div>

      {role === Role.STUDENT && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">
            등록 기간{" "}
            <span className="font-normal text-muted-foreground">
              {enrollmentStart && enrollmentEnd
                ? `(현재: ${enrollmentStart} ~ ${enrollmentEnd})`
                : "(현재: 미설정 · 무제한)"}
            </span>
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="enrollStart" className="text-xs">시작일</Label>
              <Input
                id="enrollStart"
                type="date"
                value={start}
                max={end || undefined}
                onChange={(e) => setStart(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="enrollEnd" className="text-xs">종료일</Label>
              <Input
                id="enrollEnd"
                type="date"
                value={end}
                min={start || undefined}
                onChange={(e) => setEnd(e.target.value)}
                className="w-40"
              />
            </div>
            <Button
              onClick={() => saveEnrollment(false)}
              disabled={pending || (!start && !end)}
            >
              저장
            </Button>
            <Button
              variant="outline"
              onClick={() => saveEnrollment(true)}
              disabled={pending || (!enrollmentStart && !enrollmentEnd)}
            >
              기간 해제
            </Button>
          </div>
        </div>
      )}

      {role === Role.STUDENT && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">크레딧 조정 (현재 {remainingLessons}회)</p>
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="delta" className="text-xs">증감(+/-)</Label>
              <Input
                id="delta"
                type="number"
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="memo" className="text-xs">메모(선택)</Label>
              <Input
                id="memo"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <Button onClick={applyCredits} disabled={pending || delta === 0}>
              적용
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
