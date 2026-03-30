"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import Modal from "@/components/Modal";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import {
  PlusIcon,
  FileTextIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  SparklesIcon,
} from "@/components/Icons";

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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Breadcrumb
        items={[
          { label: workTitle || "작품", href: `/work/${workId}` },
          { label: "글쓰기" },
        ]}
      />

      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-surface-900">글쓰기</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-card transition-all hover:bg-primary-700 hover:shadow-card-hover"
        >
          <PlusIcon size={18} />
          새 원고
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
              새 원고를 만들어 글을 써보세요
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              <PlusIcon size={16} />
              새 원고 만들기
            </button>
          </div>
        ) : (
          manuscripts.map((manuscript, index) => (
            <div
              key={manuscript.id}
              className="group flex items-center gap-3 rounded-xl border border-surface-200 bg-card p-4 shadow-card transition-all hover:shadow-card-hover"
            >
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => handleReorder(index, "up")}
                  disabled={index === 0}
                  className="rounded p-0.5 text-surface-300 transition-colors hover:text-surface-600 disabled:opacity-30"
                >
                  <ChevronUpIcon size={14} />
                </button>
                <button
                  onClick={() => handleReorder(index, "down")}
                  disabled={index === manuscripts.length - 1}
                  className="rounded p-0.5 text-surface-300 transition-colors hover:text-surface-600 disabled:opacity-30"
                >
                  <ChevronDownIcon size={14} />
                </button>
              </div>

              <Link
                href={`/work/${workId}/writing/${manuscript.id}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <div className="rounded-lg bg-primary-100 p-2 text-primary-600">
                  <FileTextIcon size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-surface-900">
                    {manuscript.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-surface-400">
                    <span>{manuscript.content.length.toLocaleString()}자</span>
                    <span>{formatDate(manuscript.updatedAt)}</span>
                  </div>
                </div>
              </Link>

              <button
                onClick={() => handleDelete(manuscript.id, manuscript.title)}
                className="rounded-lg p-2 text-surface-300 opacity-0 transition-all hover:bg-danger-50 hover:text-danger-500 group-hover:opacity-100"
              >
                <TrashIcon size={16} />
              </button>
            </div>
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
        <form onSubmit={handleCreate}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="원고 제목을 입력하세요"
            className="w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateModal(false);
                setNewTitle("");
              }}
              className="rounded-lg border border-surface-300 px-4 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              만들기
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
