"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Trash2, RotateCcw, Sparkles } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface TrashedWork {
  id: string;
  title: string;
  deletedAt: string;
  _count: { characters: number; manuscripts: number };
}

function getRemainingDays(deletedAt: string): number {
  const deleted = new Date(deletedAt);
  const now = new Date();
  const diffMs = now.getTime() - deleted.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, 30 - diffDays);
}

export default function TrashPage() {
  const [works, setWorks] = useState<TrashedWork[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const fetchTrash = async () => {
    try {
      const res = await fetch("/api/work/trash");
      const data = await res.json();
      setWorks(Array.isArray(data) ? data : []);
    } catch {
      setWorks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrash();
  }, []);

  const handleRestore = async (id: string) => {
    try {
      const res = await fetch(`/api/work/${id}/restore`, { method: "POST" });
      if (res.ok) {
        toast("작품이 복원되었습니다.", "success");
        fetchTrash();
      } else {
        const data = await res.json();
        toast(data.error || "복원에 실패했습니다.", "error");
      }
    } catch {
      toast("복원에 실패했습니다.", "error");
    }
  };

  const handlePermanentDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: "영구 삭제",
      message: `'${title}' 작품을 영구 삭제하시겠습니까? 모든 캐릭터와 폴더가 완전히 삭제되며 복구할 수 없습니다.`,
      confirmLabel: "영구 삭제",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/work/${id}/permanent-delete`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast("작품이 영구 삭제되었습니다.", "success");
        fetchTrash();
      } else {
        const data = await res.json();
        toast(data.error || "삭제에 실패했습니다.", "error");
      }
    } catch {
      toast("삭제에 실패했습니다.", "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <Breadcrumb items={[{ label: "휴지통" }]} />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Trash · 휴지통
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground">
            삭제된 작품
          </h1>
          <p className="mt-2 text-[14.5px] leading-[1.65] text-muted-foreground">
            삭제된 작품은 30일간 보관 후 자동으로 영구 삭제됩니다.
          </p>
        </div>
      </div>

      <Separator />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-muted via-muted to-accent/30 text-muted-foreground ring-1 ring-border">
            <Sparkles className="size-6" strokeWidth={1.8} />
          </div>
          <p className="mt-5 text-[14.5px] font-medium text-foreground">
            휴지통이 비어 있습니다
          </p>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-5")}
          >
            서재로 돌아가기
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {works.map((work) => {
            const remaining = getRemainingDays(work.deletedAt);
            return (
              <li
                key={work.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
                    {work.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                    <span>캐릭터 {work._count.characters}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>원고 {work._count.manuscripts}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span>
                      {new Date(work.deletedAt).toLocaleDateString("ko-KR")} 삭제
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="font-medium text-destructive">
                      {remaining}일 후 자동 삭제
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(work.id)}
                  >
                    <RotateCcw className="size-3.5" />
                    복원
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handlePermanentDelete(work.id, work.title)}
                  >
                    <Trash2 className="size-3.5" />
                    영구 삭제
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
