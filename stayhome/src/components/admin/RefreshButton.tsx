"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton({ slug, label }: { slug: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  function trigger() {
    startTransition(async () => {
      const start = Date.now();
      try {
        const res = await fetch(`/api/resorts/${slug.toLowerCase()}/refresh`, {
          method: "POST",
        });
        const body = await res.json();
        const elapsed = Math.round((Date.now() - start) / 100) / 10;
        if (!res.ok) {
          const msg = body?.message || body?.error || `HTTP ${res.status}`;
          toast.error(`${label} 새로고침 실패 (${elapsed}s): ${msg}`);
          setLast(`실패: ${msg}`);
          return;
        }
        if (body.status === "SUCCESS") {
          toast.success(
            `${label} 새로고침 완료 (${elapsed}s · ${body.rowsUpserted ?? 0}건)`,
          );
          setLast(`성공 ${body.rowsUpserted ?? 0}건 / ${body.durationMs}ms`);
        } else {
          const msg = body.errorMessage ?? "원인 미상";
          toast.error(`${label} 크롤링 실패 (${body.errorStage ?? "?"}): ${msg}`);
          setLast(`${body.status} · ${body.errorStage ?? "?"} · ${body.durationMs}ms`);
        }
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`${label} 호출 오류: ${msg}`);
        setLast(`오류: ${msg}`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={trigger} disabled={pending}>
        <RefreshCw className={`mr-1 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
        {pending ? "실행 중…" : "수동 새로고침"}
      </Button>
      {last && <span className="text-xs text-muted-foreground">{last}</span>}
    </div>
  );
}
