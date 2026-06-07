"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAnnouncementAction } from "@/actions/announcements";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const MAX_LEN = 5000;

export default function NewAnnouncementPage() {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [state, formAction, pending] = useActionState(
    createAnnouncementAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("공지를 등록했습니다.");
      router.push("/admin/announcements");
    } else if (state && !state.ok) {
      toast.error(state.message);
    }
  }, [state, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>공지 등록</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">제목</Label>
            <Input id="title" name="title" required maxLength={100} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="content">내용</Label>
            <textarea
              id="content"
              name="content"
              required
              value={content}
              onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
              rows={10}
              placeholder="학생과 선생님에게 전달할 공지 내용을 입력해주세요."
              className={cn(
                "w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none",
                "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
              )}
              disabled={pending}
            />
            <div className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {content.length}/{MAX_LEN}
            </div>
          </div>

          <div className="space-y-3 rounded-md border p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">게시</span>
                <span className="block text-xs text-muted-foreground">
                  끄면 임시저장 상태로, 학생·선생님에게 보이지 않습니다.
                </span>
              </span>
              <Switch name="isPublished" defaultChecked />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">중요 표시</span>
                <span className="block text-xs text-muted-foreground">
                  목록 맨 위에 고정되고 핀으로 강조됩니다.
                </span>
              </span>
              <Switch name="isPinned" />
            </label>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "등록 중..." : "등록"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
