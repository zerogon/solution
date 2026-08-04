"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const VISIBILITY_MS = 30_000;

type Reveal = { loginId: string; password: string };

export function RevealDialog({
  accountId,
  title,
  onClose,
}: {
  accountId: string | null;
  title: string;
  onClose: () => void;
}) {
  const open = accountId !== null;
  const [data, setData] = useState<Reveal | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [remaining, setRemaining] = useState(VISIBILITY_MS);

  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setShowPw(false);
    setRemaining(VISIBILITY_MS);

    fetch(`/api/admin/accounts/${accountId}/reveal`, { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error("reveal failed");
        return res.json() as Promise<Reveal>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("복호화에 실패했습니다");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, open, onClose]);

  useEffect(() => {
    if (!open || !data) return;
    const start = Date.now();
    const t = setInterval(() => {
      const left = Math.max(0, VISIBILITY_MS - (Date.now() - start));
      setRemaining(left);
      if (left === 0) {
        clearInterval(t);
        onClose();
      }
    }, 250);
    return () => clearInterval(t);
  }, [open, data, onClose]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("복사되었습니다");
    } catch {
      toast.error("복사 실패");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>계정 정보 보기</DialogTitle>
          <DialogDescription>
            {title} · 이 작업은 감사 로그에 기록됩니다.
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            복호화 중…
          </div>
        )}
        {data && (
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">ID</div>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">
                  {data.loginId}
                </code>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="ID 복사"
                  onClick={() => copy(data.loginId)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">비밀번호</div>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-sm">
                  {showPw
                    ? data.password
                    : "•".repeat(Math.min(data.password.length, 16))}
                </code>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={showPw ? "비밀번호 가리기" : "비밀번호 보기"}
                  onClick={() => setShowPw((s) => !s)}
                >
                  {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="비밀번호 복사"
                  onClick={() => copy(data.password)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* 남은 노출 시간을 막대로도 보여준다 — 숫자만으로는 임박한 게 잘 안 보인다. */}
            <div className="space-y-1">
              <div className="h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                  style={{ width: `${(remaining / VISIBILITY_MS) * 100}%` }}
                />
              </div>
              <div className="font-mono text-xs tabular-nums text-muted-foreground">
                {Math.ceil(remaining / 1000)}초 후 자동으로 닫힙니다
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
