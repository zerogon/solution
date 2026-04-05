"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Plus,
  FileText,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

interface Manuscript {
  id: string;
  title: string;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export default function WritingPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const reduce = useReducedMotion();

  const [workTitle, setWorkTitle] = useState("");
  const [manuscripts, setManuscripts] = useState<Manuscript[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const fetchWork = useCallback(async () => {
    try {
      const res = await fetch(`/api/work/${workId}`);
      if (!res.ok) return;
      const work = await res.json();
      if (work.deletedAt) {
        router.push("/");
        return;
      }
      setWorkTitle(work.title);
    } catch {
      /* ignore */
    }
  }, [workId, router]);

  const fetchManuscripts = useCallback(async () => {
    try {
      const res = await fetch(`/api/manuscript?workId=${workId}`);
      const data = await res.json();
      setManuscripts(Array.isArray(data) ? data : []);
    } catch {
      setManuscripts([]);
    } finally {
      setLoading(false);
    }
  }, [workId]);

  useEffect(() => {
    fetchWork();
    fetchManuscripts();
  }, [fetchWork, fetchManuscripts]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch("/api/manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workId, title: newTitle.trim() }),
      });
      if (res.ok) {
        toast("원고가 생성되었습니다.", "success");
        setNewTitle("");
        setShowCreateModal(false);
        fetchManuscripts();
      }
    } catch {
      toast("원고 생성에 실패했습니다.", "error");
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
      await fetch(`/api/manuscript/${id}`, { method: "DELETE" });
      toast("원고가 삭제되었습니다.", "success");
      fetchManuscripts();
    } catch {
      toast("삭제에 실패했습니다.", "error");
    }
  };

  const handleReorder = async (index: number, direction: "up" | "down") => {
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= manuscripts.length) return;

    const updated = [...manuscripts];
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];

    const items = updated.map((m, i) => ({ id: m.id, sortOrder: i }));
    setManuscripts(updated);

    try {
      await fetch("/api/manuscript/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    } catch {
      toast("순서 변경에 실패했습니다.", "error");
      fetchManuscripts();
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
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: workTitle || "작품", href: `/work/${workId}` },
            { label: "글쓰기" },
          ]}
        />
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-foreground/85">
              Writing · 글쓰기
            </p>
            <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground">
              {workTitle || "작품"} 원고
            </h1>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="size-4" />
            새 원고
          </Button>
        </div>
      </div>

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
              새 원고를 만들어 글을 써보세요
            </p>
            <Button className="mt-5" onClick={() => setShowCreateModal(true)}>
              <Plus className="size-4" />
              새 원고 만들기
            </Button>
          </div>
        ) : (
          manuscripts.map((manuscript, index) => (
            <motion.div
              key={manuscript.id}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.025 }}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleReorder(index, "up")}
                  disabled={index === 0}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="위로 이동"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  onClick={() => handleReorder(index, "down")}
                  disabled={index === manuscripts.length - 1}
                  className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-30"
                  aria-label="아래로 이동"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>

              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>

              <Link
                href={`/work/${workId}/writing/${manuscript.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary/15 to-accent/30 text-primary ring-1 ring-primary/15">
                  <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.005em] text-foreground transition-colors group-hover:text-primary">
                    {manuscript.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                    <span>{manuscript.content.length.toLocaleString()}자</span>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{formatDate(manuscript.updatedAt)}</span>
                  </div>
                </div>
              </Link>

              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(manuscript.id, manuscript.title)}
                className="text-muted-foreground/60 opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
                aria-label="원고 삭제"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </motion.div>
          ))
        )}
      </div>

      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setNewTitle("");
        }}
        title="새 원고"
        size="sm"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="원고 제목을 입력하세요"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setNewTitle("");
              }}
            >
              취소
            </Button>
            <Button type="submit" disabled={!newTitle.trim()}>
              만들기
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
