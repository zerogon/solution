"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteAnnouncementAction,
  updateAnnouncementAction,
} from "@/actions/announcements";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MAX_LEN = 5000;

interface Props {
  id: string;
  initialTitle: string;
  initialContent: string;
  initialPublished: boolean;
  initialPinned: boolean;
}

export function AnnouncementForm({
  id,
  initialTitle,
  initialContent,
  initialPublished,
  initialPinned,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isPublished, setIsPublished] = useState(initialPublished);
  const [isPinned, setIsPinned] = useState(initialPinned);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateAnnouncementAction({
        id,
        title,
        content,
        isPublished,
        isPinned,
      });
      if (res.ok) {
        toast.success("공지를 저장했습니다.");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await deleteAnnouncementAction({ id });
      if (res.ok) {
        toast.success("공지를 삭제했습니다.");
        router.push("/admin/announcements");
      } else {
        toast.error(res.message);
        setConfirmOpen(false);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="content">내용</Label>
        <textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, MAX_LEN))}
          rows={10}
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
          <Switch
            checked={isPublished}
            onCheckedChange={setIsPublished}
            disabled={pending}
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">중요 표시</span>
            <span className="block text-xs text-muted-foreground">
              목록 맨 위에 고정되고 핀으로 강조됩니다.
            </span>
          </span>
          <Switch
            checked={isPinned}
            onCheckedChange={setIsPinned}
            disabled={pending}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending || !title.trim() || !content.trim()}>
          {pending ? "저장 중..." : "저장"}
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
        >
          삭제
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>공지를 삭제할까요?</DialogTitle>
            <DialogDescription>
              삭제하면 되돌릴 수 없으며, 학생·선생님 화면에서도 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
