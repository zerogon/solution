"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { updateOwnerSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** 이름만 고친다. 쉬는 요일은 화면에서 뺐다(2026-11-06) — DB 기본값 토·일을 그대로 쓴다. */
export function OwnerSettingsForm({ name }: { name: string }) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOwnerSettings({ name: String(fd.get("name") ?? "") });
      if (res.ok) toast.success("저장했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={30} required className="max-w-xs" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
