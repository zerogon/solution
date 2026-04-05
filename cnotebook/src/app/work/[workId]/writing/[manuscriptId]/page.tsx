"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Breadcrumb from "@/components/Breadcrumb";
import WritingEditor from "@/components/WritingEditor";
import { Skeleton } from "@/components/ui/skeleton";

interface ManuscriptDetail {
  id: string;
  title: string;
  content: string;
  work: { id: string; title: string } | null;
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
      <div className="mx-auto max-w-[48rem] space-y-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!manuscript) return null;

  return (
    <div className="mx-auto max-w-[48rem]">
      <Breadcrumb
        items={[
          {
            label: manuscript.work?.title ?? "작품",
            href: `/work/${workId}`,
          },
          { label: "글쓰기", href: `/work/${workId}/writing` },
          { label: manuscript.title },
        ]}
      />

      <div className="mt-6">
        <WritingEditor
          manuscriptId={manuscript.id}
          initialTitle={manuscript.title}
          initialContent={manuscript.content}
        />
      </div>
    </div>
  );
}
