"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import WritingEditor from "@/components/WritingEditor";

interface ManuscriptDetail {
  id: string;
  title: string;
  content: string;
  work: { id: string; title: string };
}

export default function WritingEditorPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const manuscriptId = params.manuscriptId as string;

  const [manuscript, setManuscript] = useState<ManuscriptDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchManuscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/manuscript/${manuscriptId}`);
      if (!res.ok) {
        router.push(`/work/${workId}/writing`);
        return;
      }
      const data = await res.json();
      setManuscript(data);
    } catch {
      router.push(`/work/${workId}/writing`);
    } finally {
      setLoading(false);
    }
  }, [manuscriptId, workId, router]);

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
      <Breadcrumb
        items={[
          {
            label: manuscript.work.title,
            href: `/work/${workId}`,
          },
          { label: "글쓰기", href: `/work/${workId}/writing` },
          { label: manuscript.title },
        ]}
      />

      <div className="mt-6">
        <WritingEditor
          manuscriptId={manuscript.id}
          workId={workId}
          initialTitle={manuscript.title}
          initialContent={manuscript.content}
        />
      </div>
    </div>
  );
}
