"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { FileText, Sparkles, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface GlobalManuscript {
  id: string;
  title: string;
  content: string;
  workId: string | null;
  updatedAt: string;
  work: { id: string; title: string } | null;
}

interface Work {
  id: string;
  title: string;
}

export default function GlobalWritingPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const reduce = useReducedMotion();
  const [manuscripts, setManuscripts] = useState<GlobalManuscript[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingDraft, setCreatingDraft] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [mRes, wRes] = await Promise.all([
          fetch("/api/manuscript"),
          fetch("/api/work"),
        ]);
        const mData = await mRes.json();
        const wData = await wRes.json();
        setManuscripts(Array.isArray(mData) ? mData : []);
        setWorks(Array.isArray(wData) ? wData : []);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleNewDraft = async () => {
    if (creatingDraft) return;
    setCreatingDraft(true);
    try {
      const res = await fetch("/api/manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const created = await res.json();
        router.push(`/writing/${created.id}`);
        return;
      }
    } catch {
      /* ignore */
    }
    setCreatingDraft(false);
  };

  const handleAssignWork = async (
    manuscriptId: string,
    workId: string | null
  ) => {
    const prev = manuscripts;
    setManuscripts((ms) =>
      ms.map((m) =>
        m.id === manuscriptId
          ? {
              ...m,
              workId,
              work: workId
                ? works.find((w) => w.id === workId)
                  ? { id: workId, title: works.find((w) => w.id === workId)!.title }
                  : null
                : null,
            }
          : m
      )
    );
    try {
      const res = await fetch(`/api/manuscript/${manuscriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId }),
      });
      if (!res.ok) {
        setManuscripts(prev);
        toast("작품 지정에 실패했습니다.", "error");
      }
    } catch {
      setManuscripts(prev);
      toast("작품 지정에 실패했습니다.", "error");
    }
  };

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: "원고 삭제",
      message: `"${title}" 원고를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`,
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/manuscript/${id}`, { method: "DELETE" });
      if (res.ok) {
        setManuscripts((ms) => ms.filter((m) => m.id !== id));
        toast("원고가 삭제되었습니다.", "success");
      } else {
        toast("삭제에 실패했습니다.", "error");
      }
    } catch {
      toast("삭제에 실패했습니다.", "error");
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            Manuscripts · 원고
          </p>
          <h1 className="text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground">
            내 원고
          </h1>

        </div>
        <Button onClick={handleNewDraft} disabled={creatingDraft}>
          <Plus className="size-4" />
          새 원고
        </Button>
      </header>

      <Separator />

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5"
            >
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-3 h-4 w-32" />
            </div>
          ))
        ) : manuscripts.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-accent/30 text-primary ring-1 ring-primary/15 shadow-sm shadow-primary/10">
              <Sparkles className="size-6" strokeWidth={1.8} />
            </div>
            <p className="mt-5 text-[14.5px] font-medium text-foreground">
              아직 원고가 없습니다
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              첫 원고를 작성하며 이야기를 시작해보세요.
            </p>
            <Button className="mt-5" onClick={handleNewDraft} disabled={creatingDraft}>
              <Plus className="size-4" />
              새 원고 작성
            </Button>
          </div>
        ) : (
          manuscripts.map((m, i) => (
            <motion.div
              key={m.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.025 }}
              className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
            >
              <Link
                href={`/writing/${m.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/15 to-accent/30 text-primary ring-1 ring-primary/15">
                  <FileText className="size-4" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.005em] text-foreground transition-colors group-hover:text-primary">
                    {m.title || "제목 없음"}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
                    <span>{m.content.length.toLocaleString()}자</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{formatDate(m.updatedAt)}</span>
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-2 sm:shrink-0">
                <Select
                  value={m.workId ?? "__none__"}
                  onValueChange={(v) =>
                    handleAssignWork(m.id, v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger size="sm" className="min-w-[120px] text-xs">
                    <SelectValue placeholder="작품">
                      {(value) => {
                        if (!value || value === "__none__") return "미분류";
                        return (
                          works.find((w) => w.id === value)?.title ?? "작품"
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">미분류</SelectItem>
                    {works.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(m.id, m.title)}
                  className="text-muted-foreground/60 hover:text-destructive"
                  aria-label="원고 삭제"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
