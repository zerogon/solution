"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Breadcrumb from "@/components/Breadcrumb";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { TrashIcon, RotateCcwIcon, SparklesIcon } from "@/components/Icons";

interface TrashedWork {
  id: string;
  title: string;
  deletedAt: string;
  _count: { characters: number };
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
    <div className="animate-fade-in">
      <Breadcrumb items={[{ label: "휴지통" }]} />

      <div className="mt-3">
        <h1 className="text-2xl font-bold text-surface-900">휴지통</h1>
        <p className="mt-1 text-sm text-surface-400">
          삭제된 작품은 30일간 보관 후 자동으로 영구 삭제됩니다
        </p>
      </div>

      {loading ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl bg-surface-100"
            />
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-surface-100 p-4">
            <SparklesIcon size={32} className="text-surface-400" />
          </div>
          <p className="mt-4 text-lg font-medium text-surface-600">
            휴지통이 비어 있습니다
          </p>
          <Link
            href="/"
            className="mt-4 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
          >
            홈으로 돌아가기
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {works.map((work) => {
            const remaining = getRemainingDays(work.deletedAt);
            return (
              <div
                key={work.id}
                className="flex items-center justify-between rounded-xl border border-surface-200 bg-card p-4 shadow-card"
              >
                <div>
                  <h3 className="font-semibold text-surface-800">
                    {work.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-surface-400">
                    <span>캐릭터 {work._count.characters}명</span>
                    <span>
                      {new Date(work.deletedAt).toLocaleDateString("ko-KR")}{" "}
                      삭제
                    </span>
                    <span className="font-medium text-danger-500">
                      {remaining}일 후 자동 삭제
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRestore(work.id)}
                    className="flex items-center gap-1 rounded-lg border border-surface-300 px-3 py-1.5 text-sm text-surface-600 transition-colors hover:bg-surface-100"
                  >
                    <RotateCcwIcon size={14} />
                    복원
                  </button>
                  <button
                    onClick={() =>
                      handlePermanentDelete(work.id, work.title)
                    }
                    className="flex items-center gap-1 rounded-lg border border-danger-300 px-3 py-1.5 text-sm text-danger-500 transition-colors hover:bg-danger-50"
                  >
                    <TrashIcon size={14} />
                    영구 삭제
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
