"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Plus, Sparkles, Trash2, FileText, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonWorkCard } from "@/components/Skeleton";
import { cn } from "@/lib/utils";

interface Work {
  id: string;
  title: string;
  createdAt: string;
  _count: { characters: number; manuscripts: number };
}

export default function Home() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [works, setWorks] = useState<Work[]>([]);
  const [title, setTitle] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      setTitle("");
      setShowDialog(false);
      fetchWorks();
    } finally {
      setSubmitting(false);
    }
  };

  const container = {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: { staggerChildren: reduce ? 0 : 0.035, delayChildren: 0.02 },
    },
  };
  const item = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 6 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
    },
  };

  return (
    <div className="space-y-10">
      {/* Masthead */}
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <span aria-hidden className="inline-block size-1 rounded-full bg-primary" />
            Library · 작품 서재
          </p>
          <h1 className="text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground sm:text-[2.125rem]">
            내 작품
          </h1>
          <p className="max-w-md text-[15px] leading-[1.65] text-muted-foreground">
            작품별로 캐릭터를 정돈하고, 원고를 쓰는 순간 바로 꺼내어 볼 수 있게.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link href="/trash" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
            <Trash2 className="size-3.5" />
            휴지통
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleQuickWrite}
            disabled={creatingDraft}
          >
            <FileText className="size-3.5" />
            빠른 글쓰기
          </Button>
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="size-3.5" />
            작품 추가
          </Button>
        </div>
      </header>

      <Separator />

      {/* Content */}
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonWorkCard key={i} />
          ))}
        </div>
      ) : works.length === 0 ? (
        <div className="flex flex-col items-center px-6 py-24 text-center">
          <div className="relative flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-accent/30 text-primary ring-1 ring-primary/20 shadow-lg shadow-primary/10">
            <Sparkles className="size-7" strokeWidth={1.8} />
          </div>
          <h2 className="mt-6 text-xl font-semibold tracking-[-0.01em] text-foreground">
            아직 등록된 작품이 없어요
          </h2>
          <p className="mt-2 max-w-sm text-[14.5px] leading-[1.7] text-muted-foreground">
            첫 작품을 등록하고 캐릭터를 모아보세요. 나만의 인물 사전이 만들어집니다.
          </p>
          <Button className="mt-6" onClick={() => setShowDialog(true)}>
            <Plus className="size-4" />
            첫 작품 추가하기
          </Button>
        </div>
      ) : (
        <motion.div
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {works.map((work) => (
            <motion.div key={work.id} variants={item}>
              <WorkCard work={work} />
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Create Work Dialog */}
      <Dialog
        open={showDialog}
        onOpenChange={(next) => {
          setShowDialog(next);
          if (!next) setTitle("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
              새 작품 추가
            </DialogTitle>
            <DialogDescription>
              작품 제목은 나중에 언제든 바꿀 수 있어요.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="work-title">작품명</Label>
              <Input
                id="work-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예) 저녁의 서사시"
                autoFocus
                disabled={submitting}
              />
            </div>
            <DialogFooter>
              <DialogClose
                render={<Button type="button" variant="outline" />}
              >
                취소
              </DialogClose>
              <Button type="submit" disabled={!title.trim() || submitting}>
                추가
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function WorkCard({ work }: { work: Work }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: 0.15 }}
      className="h-full"
    >
      <Link
        href={`/work/${work.id}`}
        className="group relative flex h-full flex-col justify-between overflow-hidden rounded-xl border border-border bg-card p-6 transition-all hover:border-primary/50 hover:shadow-[0_8px_24px_-12px] hover:shadow-primary/20"
      >
        {/* Ambient corner glow on hover */}
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        />
        {/* Left accent rule */}
        <span
          aria-hidden
          className="absolute inset-y-5 left-0 w-[3px] rounded-r-full bg-gradient-to-b from-primary via-primary/70 to-primary/30 transition-all group-hover:from-primary group-hover:via-primary group-hover:to-accent-foreground/40"
        />
        <div className="relative pl-3">
          <h2
            title={work.title}
            className="truncate text-[17px] font-semibold leading-[1.35] tracking-[-0.01em] text-foreground transition-colors group-hover:text-primary"
          >
            {work.title}
          </h2>
          <div className="mt-5 flex items-center gap-2">
            <Badge className="rounded-full border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/10">
              캐릭터 {work._count.characters}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-accent-foreground/25 bg-accent/60 px-2.5 py-0.5 text-xs font-medium text-accent-foreground"
            >
              원고 {work._count.manuscripts}
            </Badge>
          </div>
        </div>
        <div className="relative mt-6 flex items-center justify-between pl-3 text-xs">
          <span className="tabular-nums uppercase tracking-[0.06em] text-muted-foreground">
            {new Date(work.createdAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground/60 opacity-0 transition-all group-hover:translate-x-0 group-hover:text-primary group-hover:opacity-100" />
        </div>
      </Link>
    </motion.div>
  );
}
