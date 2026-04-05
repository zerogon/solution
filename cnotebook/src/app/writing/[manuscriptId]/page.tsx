"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import WritingEditor from "@/components/WritingEditor";

interface ManuscriptDetail {
  id: string;
  title: string;
  content: string;
  work: { id: string; title: string } | null;
}

export default function StandaloneWritingEditorPage() {
  const params = useParams();
  const router = useRouter();
  const manuscriptId = params.manuscriptId as string;

  const [manuscript, setManuscript] = useState<ManuscriptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchManuscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/manuscript/${manuscriptId}`);
      if (!res.ok) {
        router.push(`/writing`);
        return;
      }
      const data = await res.json();
      setManuscript(data);
    } catch {
      router.push(`/writing`);
    } finally {
      setLoading(false);
    }
  }, [manuscriptId, router]);

  useEffect(() => {
    fetchManuscript();
  }, [fetchManuscript]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="animate-skeleton">
          <div className="h-4 w-48 rounded bg-surface-200" />
          <div className="mt-6 h-8 w-64 rounded bg-surface-200" />
          <div className="mt-4 h-96 rounded bg-surface-100" />
        </div>
      </div>
    );
  }

  if (!manuscript) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/writing"
          className="text-surface-500 transition-colors hover:text-primary-700"
        >
          ← 원고 목록
        </Link>
        {manuscript.work && (
          <>
            <span className="text-surface-300">·</span>
            <span className="rounded-md bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-600">
              {manuscript.work.title}
            </span>
          </>
        )}
        {!manuscript.work && (
          <>
            <span className="text-surface-300">·</span>
            <span className="rounded-md bg-surface-100 px-2 py-0.5 text-xs font-medium text-surface-400">
              미분류
            </span>
          </>
        )}
      </div>

      <div className="mt-4">
        <WritingEditor
          manuscriptId={manuscript.id}
          initialTitle={manuscript.title}
          initialContent={manuscript.content}
        />
      </div>
    </div>
  );
}
