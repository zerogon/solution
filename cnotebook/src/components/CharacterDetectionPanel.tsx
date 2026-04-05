"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronDown, User, X, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface DetectedCharacter {
  id: string;
  name: string;
  role: string | null;
  gender: string | null;
  age: number | null;
  personality: string | null;
  features: string | null;
  aliases: string | null;
  imageUrl: string | null;
  work: { id: string; title: string };
}

interface Props {
  characters: DetectedCharacter[];
}

export default function CharacterDetectionPanel({ characters }: Props) {
  const reduce = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const prevCountRef = useRef(characters.length);

  useEffect(() => {
    if (characters.length > 0 && characters.length !== prevCountRef.current) {
      setDismissed(false);
    }
    prevCountRef.current = characters.length;
  }, [characters]);

  if (characters.length === 0 || dismissed) return null;

  const selected = selectedId
    ? characters.find((c) => c.id === selectedId) ?? null
    : null;

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl"
    >
      {/* Chip bar */}
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <Badge className="shrink-0 rounded-md bg-primary text-primary-foreground">
          {characters.length}
        </Badge>

        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
          {characters.map((char) => {
            const isSelected = selected?.id === char.id;
            return (
              <button
                key={char.id}
                onClick={() => setSelectedId(isSelected ? null : char.id)}
                className={cn(
                  "group/chip flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2.5 text-xs font-medium transition-all",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground/80 hover:border-primary/40 hover:bg-primary/5"
                )}
              >
                <span
                  className={cn(
                    "max-w-[5rem] truncate rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.06em]",
                    isSelected
                      ? "bg-primary-foreground/15 text-primary-foreground/80"
                      : "bg-muted text-muted-foreground"
                  )}
                  title={char.work.title}
                >
                  {char.work.title}
                </span>
                <span className="truncate">{char.name}</span>
                {char.role && (
                  <span
                    className={cn(
                      "text-[10.5px]",
                      isSelected ? "text-primary-foreground/75" : "text-muted-foreground"
                    )}
                  >
                    {char.role}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          aria-label="닫기"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex gap-4 rounded-xl bg-primary/5 p-4 ring-1 ring-primary/15">
                <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-background ring-1 ring-border">
                  {selected.imageUrl ? (
                    <Image
                      src={selected.imageUrl}
                      alt={selected.name}
                      width={56}
                      height={56}
                      unoptimized={selected.imageUrl.startsWith("/uploads/")}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                      <User className="size-6" strokeWidth={1.4} />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {selected.work.title}
                    </Badge>
                    <h4 className="text-[14.5px] font-semibold tracking-[-0.005em] text-foreground">
                      {selected.name}
                    </h4>
                    {selected.role && (
                      <Badge
                        variant="outline"
                        className="border-primary/25 bg-primary/5 text-[10px] font-medium text-primary"
                      >
                        {selected.role}
                      </Badge>
                    )}
                    {selected.gender && (
                      <span className="text-xs text-muted-foreground">
                        {selected.gender}
                      </span>
                    )}
                    {selected.age && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {selected.age}세
                      </span>
                    )}
                  </div>

                  {selected.personality && (
                    <p className="mt-1.5 line-clamp-1 text-[13px] leading-[1.6] text-foreground/80">
                      <span className="font-semibold text-muted-foreground">성격 · </span>
                      {selected.personality}
                    </p>
                  )}
                  {selected.features && (
                    <p className="mt-0.5 line-clamp-1 text-[13px] leading-[1.6] text-foreground/80">
                      <span className="font-semibold text-muted-foreground">특징 · </span>
                      {selected.features}
                    </p>
                  )}

                  <Link
                    href={`/work/${selected.work.id}/character/${selected.id}`}
                    target="_blank"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    상세보기
                    <ArrowUpRight className="size-3" />
                  </Link>
                </div>

                <button
                  onClick={() => setSelectedId(null)}
                  className="self-start rounded-md p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="접기"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
