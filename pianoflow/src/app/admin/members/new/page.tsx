"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { adminCreateMember } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Role } from "@/generated/prisma/enums";
import { SPECIALTY_LABEL, SPECIALTY_ORDER } from "@/lib/specialty";
import { formatKstDate } from "@/lib/slots";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KeyRound } from "lucide-react";

/** YYYY-MM-DD 문자열에 1개월을 더한 날짜. 목표 월에 없는 일자는 말일로 클램프(예: 1/31 → 2/28). */
function addOneMonth(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const targetYear = m === 12 ? y + 1 : y;
  const targetMonth = m === 12 ? 1 : m + 1; // 1-12
  // 목표 월의 말일 = 그 다음 달 0일
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function NewMemberPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>(Role.STUDENT);
  const [enrollStart, setEnrollStart] = useState("");
  const [enrollEnd, setEnrollEnd] = useState("");
  const [state, formAction, pending] = useActionState(adminCreateMember, undefined);
  const [issued, setIssued] = useState<{
    loginId: string;
    tempPassword: string;
  } | null>(null);

  // 시작일 기본값 = 등록 당일(KST). 하이드레이션 불일치 방지를 위해 마운트 후 설정.
  useEffect(() => {
    setEnrollStart((prev) => prev || formatKstDate(new Date()));
  }, []);

  useEffect(() => {
    if (state?.ok && state.data) {
      setIssued({
        loginId: state.data.loginId,
        tempPassword: state.data.tempPassword,
      });
      toast.success("회원이 등록되었습니다. 로그인 ID/비밀번호를 전달해주세요.");
    } else if (state && !state.ok) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>회원 등록</CardTitle>
      </CardHeader>
      <CardContent>
        {issued ? (
          <div className="space-y-4">
            <Alert variant="warning">
              <KeyRound />
              <AlertTitle>로그인 정보가 발급되었습니다</AlertTitle>
              <AlertDescription>
                <div className="w-full space-y-3">
                  <div>
                    <p className="font-semibold">로그인 ID (휴대폰 8자리)</p>
                    <p className="mt-0.5 font-mono text-xl tabular-nums">
                      {issued.loginId}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold">초기 비밀번호 (휴대폰 끝 4자리)</p>
                    <p className="mt-0.5 font-mono text-xl tabular-nums">
                      {issued.tempPassword}
                    </p>
                  </div>
                  <p className="text-xs opacity-80">회원에게 전달해주세요.</p>
                </div>
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button onClick={() => router.push("/admin/members")}>목록으로</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIssued(null);
                  router.refresh();
                }}
              >
                추가 등록
              </Button>
            </div>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">휴대폰 (예: 010-1234-5678)</Label>
              <Input id="phone" name="phone" required placeholder="010-1234-5678" />
            </div>
            <div className="space-y-2">
              <Label>역할</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as Role)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={Role.STUDENT}>학생</SelectItem>
                  <SelectItem value={Role.TEACHER}>선생님</SelectItem>
                  <SelectItem value={Role.ADMIN}>관리자</SelectItem>
                </SelectContent>
              </Select>
              <input type="hidden" name="role" value={role} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">비고 (선택)</Label>
              <textarea
                id="note"
                name="note"
                rows={3}
                maxLength={500}
                placeholder="예: 9월 초 등록 예정, 상담 완료"
                className="w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30"
              />
            </div>
            {role === Role.TEACHER && (
              <div className="space-y-2">
                <Label>전공 (복수 선택 가능)</Label>
                <div className="flex flex-wrap gap-4">
                  {SPECIALTY_ORDER.map((s) => (
                    <label
                      key={s}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        name="specialties"
                        value={s}
                        className="size-4 accent-primary"
                      />
                      {SPECIALTY_LABEL[s]}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {role === Role.STUDENT && (
              <>
                <div className="space-y-2">
                  <Label>등록 기간</Label>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="enrollmentStart" className="text-xs">
                        시작일
                      </Label>
                      <Input
                        id="enrollmentStart"
                        name="enrollmentStart"
                        type="date"
                        required
                        value={enrollStart}
                        max={enrollEnd || undefined}
                        onChange={(e) => setEnrollStart(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="enrollmentEnd" className="text-xs">
                        종료일
                      </Label>
                      <Input
                        id="enrollmentEnd"
                        name="enrollmentEnd"
                        type="date"
                        required
                        value={enrollEnd}
                        min={enrollStart || undefined}
                        onChange={(e) => setEnrollEnd(e.target.value)}
                        className="w-40"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!enrollEnd && !enrollStart}
                      onClick={() =>
                        setEnrollEnd((prev) => addOneMonth(prev || enrollStart))
                      }
                    >
                      +1개월
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="remainingLessons">초기 레슨 횟수</Label>
                  <Input
                    id="remainingLessons"
                    name="remainingLessons"
                    type="number"
                    min={0}
                    defaultValue={0}
                  />
                </div>
              </>
            )}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "등록 중..." : "등록"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
