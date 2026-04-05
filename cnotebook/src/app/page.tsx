"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SparklesIcon, TrashIcon, FileTextIcon } from "@/components/Icons";
import { SkeletonWorkCard } from "@/components/Skeleton";
import Modal from "@/components/Modal";

interface Work {
  id: string;
  title: string;
  createdAt: string;
  _count: { characters: number; manuscripts: number };
}

export default function Home() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [title, setTitle] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingDraft, setCreatingDraft] = useState(false);

  const handleQuickWrite = async () => {
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

  const fetchWorks = async () => {
    try {
      const res = await fetch("/api/work");
      const data = await res.json();
      setWorks(Array.isArray(data) ? data : []);
    } catch {
      setWorks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorks();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await fetch("/api/work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });

    setTitle("");
    setShowModal(false);
    fetchWorks();
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-surface-900">내 작품</h1>
          <p className="mt-1 hidden text-sm text-surface-400 sm:block">
            캐릭터를 한곳에서 관리하세요
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/trash"
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-300 px-3 py-2 text-sm text-surface-500 transition-colors hover:bg-surface-100"
          >
            <TrashIcon size={16} />
            휴지통
          </Link>
          <button
            onClick={handleQuickWrite}
            disabled={creatingDraft}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
          >
            <FileTextIcon size={16} />
            글쓰기
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <PlusIcon size={16} />
            작품 추가
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonWorkCard key={i} />
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="mt-20 flex flex-col items-center text-center">
          <div className="rounded-2xl bg-primary-50 p-4">
            <SparklesIcon size={32} className="text-primary-400" />
          </div>
          <p className="mt-4 text-lg font-medium text-surface-600">
            아직 등록된 작품이 없어요
          </p>
          <p className="mt-1 text-sm text-surface-400">
            작품을 추가하여 캐릭터를 관리해보세요
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-5 flex items-center gap-1.5 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <PlusIcon size={16} />
            첫 작품 추가하기
          </button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((work) => (
            <Link
              key={work.id}
              href={`/work/${work.id}`}
              className="group block rounded-xl border border-surface-200 border-l-4 border-l-primary-400 bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
            >
              <h2 className="text-lg font-semibold text-surface-800 transition-colors group-hover:text-primary-700">
                {work.title}
              </h2>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                    캐릭터 {work._count.characters}명
                  </span>
                  <span className="inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-medium text-accent-700">
                    원고 {work._count.manuscripts}편
                  </span>
                </div>
                <span className="text-xs text-surface-400">
                  {new Date(work.createdAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create Work Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          setShowModal(false);
          setTitle("");
        }}
        title="새 작품 추가"
      >
        <form onSubmit={handleCreate}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="작품명을 입력하세요"
            className="w-full rounded-lg border border-surface-300 bg-card px-4 py-2.5 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowModal(false);
                setTitle("");
              }}
              className="rounded-lg px-4 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              추가
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
