"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  FileTextIcon,
  SparklesIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/Icons";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/ConfirmDialog";

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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">원고</h1>
          <p className="mt-1 hidden text-sm text-surface-400 sm:block">
            작성한 원고를 한 곳에서 관리하세요
          </p>
        </div>
        <button
          onClick={handleNewDraft}
          disabled={creatingDraft}
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          <PlusIcon size={16} />
          글쓰기
        </button>
      </div>

      <div className="mt-6 space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="animate-skeleton rounded-xl border border-surface-200 bg-card p-5"
            >
              <div className="h-5 w-48 rounded bg-surface-200" />
              <div className="mt-3 h-4 w-32 rounded bg-surface-100" />
            </div>
          ))
        ) : manuscripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-surface-200 bg-card py-16">
            <div className="rounded-2xl bg-surface-100 p-4">
              <SparklesIcon size={32} className="text-primary-400" />
            </div>
            <p className="mt-4 text-sm font-medium text-surface-600">
              아직 원고가 없습니다
            </p>
            <p className="mt-1 text-xs text-surface-400">
              글쓰기 버튼으로 첫 원고를 작성해보세요
            </p>
            <button
              onClick={handleNewDraft}
              disabled={creatingDraft}
              className="mt-4 flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              <PlusIcon size={16} />
              글쓰기
            </button>
          </div>
        ) : (
          manuscripts.map((m) => (
            <div
              key={m.id}
              className="group flex flex-col gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-card transition-all hover:shadow-card-hover sm:flex-row sm:items-center"
            >
              <Link
                href={`/writing/${m.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="rounded-lg bg-primary-100 p-2 text-primary-600">
                  <FileTextIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-surface-900">
                    {m.title || "제목 없음"}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-surface-400">
                    <span>{m.content.length.toLocaleString()}자</span>
                    <span>{formatDate(m.updatedAt)}</span>
                  </div>
                </div>
              </Link>

              <div className="flex items-center gap-2 sm:shrink-0">
                <select
                  value={m.workId ?? ""}
                  onChange={(e) =>
                    handleAssignWork(m.id, e.target.value || null)
                  }
                  className="rounded-lg border border-surface-300 bg-card px-2 py-1.5 text-xs text-surface-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  aria-label="작품 지정"
                >
                  <option value="">미분류</option>
                  {works.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => handleDelete(m.id, m.title)}
                  className="rounded-lg p-2 text-surface-300 transition-all hover:bg-danger-50 hover:text-danger-500"
                  aria-label="원고 삭제"
                >
                  <TrashIcon size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
