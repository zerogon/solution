"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import WritingEditor from "@/components/WritingEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex flex-wrap items-center gap-3 text-[13px]">
        <Link
          href="/writing"
          className="inline-flex items-center gap-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          원고 목록
        </Link>
        <span className="text-muted-foreground/40">·</span>
        {manuscript.work ? (
          <Badge variant="secondary" className="font-normal">
            {manuscript.work.title}
          </Badge>
        ) : (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            미분류
          </Badge>
        )}
      </div>

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
