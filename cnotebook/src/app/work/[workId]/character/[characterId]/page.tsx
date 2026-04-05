"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Pencil, Trash2, User } from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonDetailPage } from "@/components/Skeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface CharacterDetail {
  id: string;
  name: string;
  role: string | null;
  gender: string | null;
  birthday: string | null;
  age: number | null;
  height: number | null;
  weight: number | null;
  hairColor: string | null;
  hairStyle: string | null;
  eyeColor: string | null;
  hairColorHex: string | null;
  eyeColorHex: string | null;
  personality: string | null;
  features: string | null;
  region: string | null;
  affiliation: string | null;
  foreshadowing: string | null;
  death: string | null;
  notes: string | null;
  aliases: string | null;
  imageUrl: string | null;
  work: { id: string; title: string };
}

function InfoRow({
  label,
  value,
  colorHex,
}: {
  label: string;
  value: string | number | null;
  colorHex?: string | null;
}) {
  if (!value && !colorHex) return null;
  return (
    <div className="grid grid-cols-[6rem_1fr] gap-4 py-3">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="flex items-center gap-2 text-[14.5px] leading-[1.7] text-foreground whitespace-pre-wrap">
        {colorHex && (
          <span
            className="inline-block size-4 shrink-0 rounded-full ring-1 ring-border"
            style={{ backgroundColor: colorHex }}
          />
        )}
        <span>{value}</span>
      </dd>
    </div>
  );
}

function InfoSection({
  title,
  children,
  tone = "primary",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "primary" | "accent" | "muted";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "accent"
        ? "text-accent-foreground/80"
        : "text-muted-foreground";
  const dotClass =
    tone === "primary"
      ? "bg-primary"
      : tone === "accent"
        ? "bg-accent-foreground/70"
        : "bg-muted-foreground/50";
  return (
    <section className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-border/80">
      <h3
        className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${toneClass}`}
      >
        <span aria-hidden className={`inline-block size-1 rounded-full ${dotClass}`} />
        {title}
      </h3>
      <Separator className="mt-3 mb-1" />
      <dl className="divide-y divide-border/60">{children}</dl>
    </section>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const characterId = params.characterId as string;
  const { confirm } = useConfirm();

  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/character/${characterId}`)
      .then((res) => res.json())
      .then((data) => {
        setCharacter(data);
        setLoading(false);
      });
  }, [characterId]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: "캐릭터 삭제",
      message: "이 캐릭터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/character/${characterId}`, { method: "DELETE" });
    router.push(`/work/${workId}`);
  };

  if (loading) return <SkeletonDetailPage />;

  if (!character) {
    return (
      <div className="py-16 text-center text-[14px] text-muted-foreground">
        캐릭터를 찾을 수 없습니다.
      </div>
    );
  }

  const hasBasicInfo =
    character.gender || character.birthday || character.age || character.height || character.weight;
  const hasAppearance =
    character.hairColor || character.hairColorHex || character.hairStyle || character.eyeColor || character.eyeColorHex;
  const hasSettings =
    character.personality || character.features || character.region || character.affiliation;
  const hasStory = character.foreshadowing || character.death;

  return (
    <div className="mx-auto max-w-[48rem] space-y-8">
      <Breadcrumb
        items={[
          { label: character.work.title, href: `/work/${workId}` },
          { label: character.name },
        ]}
      />

      {/* Hero */}
      <article className="relative space-y-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/[0.04] via-background to-accent/20 p-6 shadow-sm sm:p-8">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl"
        />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="relative h-48 w-full shrink-0 overflow-hidden rounded-xl ring-1 ring-primary/20 shadow-md shadow-primary/10 sm:size-44">
            {character.imageUrl ? (
              <Image
                src={character.imageUrl}
                alt={character.name}
                fill
                unoptimized={character.imageUrl.startsWith("/uploads/")}
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 176px"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 via-accent/20 to-primary/5">
                <User className="size-14 text-primary/40" strokeWidth={1.4} />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {character.role && (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {character.role}
              </p>
            )}
            <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground sm:text-[2.125rem]">
              {character.name}
            </h1>
            {character.aliases && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {character.aliases.split(",").map((alias, i) => (
                  <Badge key={i} variant="secondary" className="font-normal">
                    {alias.trim()}
                  </Badge>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href={`/work/${workId}/character/${characterId}/edit`}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                <Pencil className="size-3.5" />
                수정
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            </div>
          </div>
        </div>
      </article>

      <Separator />

      {/* Info Sections */}
      <div className="space-y-4">
        {hasBasicInfo && (
          <InfoSection title="Basic · 기본 정보">
            <InfoRow label="성별" value={character.gender} />
            <InfoRow label="생일" value={character.birthday} />
            <InfoRow label="나이" value={character.age} />
            <InfoRow label="키" value={character.height ? `${character.height}cm` : null} />
            <InfoRow label="체중" value={character.weight ? `${character.weight}kg` : null} />
          </InfoSection>
        )}

        {hasAppearance && (
          <InfoSection title="Appearance · 외형" tone="accent">
            <InfoRow label="머리색" value={character.hairColor} colorHex={character.hairColorHex} />
            <InfoRow label="헤어스타일" value={character.hairStyle} />
            <InfoRow label="눈색" value={character.eyeColor} colorHex={character.eyeColorHex} />
          </InfoSection>
        )}

        {hasSettings && (
          <InfoSection title="Profile · 설정">
            <InfoRow label="성격" value={character.personality} />
            <InfoRow label="특징" value={character.features} />
            <InfoRow label="지역" value={character.region} />
            <InfoRow label="소속" value={character.affiliation} />
          </InfoSection>
        )}

        {hasStory && (
          <InfoSection title="Story · 스토리 관련" tone="accent">
            <InfoRow label="복선" value={character.foreshadowing} />
            <InfoRow label="사망" value={character.death} />
          </InfoSection>
        )}

        {character.notes && (
          <InfoSection title="Notes · 기타" tone="muted">
            <InfoRow label="비고" value={character.notes} />
          </InfoSection>
        )}
      </div>
    </div>
  );
}
