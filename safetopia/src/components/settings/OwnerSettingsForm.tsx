"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOwnerSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accrualOn, formatPeriodLabel, nextAccrualIso } from "@/lib/leave-accrual";
import { formatDays } from "@/lib/labels";
import { formatKoDate } from "@/lib/utils";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 이름과 입사일. 쉬는 요일은 화면에서 뺐다(2026-11-06) — DB 기본값 토·일을 그대로 쓴다.
 * 입사일을 적는 즉시 오늘 기준 회차·발생 일수를 미리 보여 준다(`todayIso`는 서버가 내려 준다 — 브라우저 시간대 회피).
 */
export function OwnerSettingsForm({ name, hireIso, todayIso }: { name: string; hireIso: string | null; todayIso: string }) {
  const [hireDate, setHireDate] = useState(hireIso ?? "");
  const [pending, startTransition] = useTransition();

  const previewable = ISO_RE.test(hireDate) && hireDate <= todayIso;
  const preview = previewable ? accrualOn(hireDate, todayIso) : null;
  const next = preview && preview.period.index === 1 ? nextAccrualIso(hireDate, todayIso) : null;
  const changed = hireIso != null && hireDate !== hireIso;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOwnerSettings({ name: String(fd.get("name") ?? ""), hireDate });
      if (res.ok) toast.success("저장했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" defaultValue={name} maxLength={30} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hireDate">입사일</Label>
          <Input
            id="hireDate"
            name="hireDate"
            type="date"
            value={hireDate}
            max={todayIso}
            onChange={(e) => setHireDate(e.target.value)}
            required
            className="font-mono tabular-nums"
          />
        </div>
      </div>
      {preview && (
        <p className="text-sm text-muted-foreground">
          오늘 기준 <span className="text-foreground">{formatPeriodLabel(preview.period)}</span> · 발생{" "}
          <span className="font-mono tabular-nums text-foreground">{formatDays(preview.autoDays)}</span>
          {next && (
            <>
              {" "}· 다음 발생 <span className="font-mono tabular-nums text-foreground">{formatKoDate(next.iso)}</span> +{formatDays(next.days)}
            </>
          )}
        </p>
      )}
      {changed && (
        <p className="text-xs text-amber-700">
          입사일을 바꾸면 회차 경계가 다시 계산됩니다. 경계에 걸치게 된 연차는 나눠서 다시 등록해야 하고, 회차별 이월·보정은 번호 그대로 남습니다.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
