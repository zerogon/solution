"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonDetailPage } from "@/components/Skeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import { PencilIcon, TrashIcon, UserIcon } from "@/components/Icons";

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
    <div className="flex gap-4 py-2.5">
      <span className="w-20 shrink-0 text-sm font-medium text-surface-400">{label}</span>
      <span className="flex items-center gap-2 text-sm text-surface-800 whitespace-pre-wrap">
        {colorHex && (
          <span
            className="inline-block h-4 w-4 shrink-0 rounded-full border border-surface-200"
            style={{ backgroundColor: colorHex }}
          />
        )}
        {value}
      </span>
    </div>
  );
}

function InfoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-card p-5 shadow-card">
      <h3 className="flex items-center gap-2 text-sm font-bold text-surface-700">
        <span className="h-4 w-1 rounded-full bg-primary-400" />
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </div>
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

  if (loading) {
    return <SkeletonDetailPage />;
  }

  if (!character) {
    return (
      <div className="py-12 text-center text-surface-400">
        캐릭터를 찾을 수 없습니다.
      </div>
    );
  }

  const hasBasicInfo = character.gender || character.birthday || character.age || character.height || character.weight;
  const hasAppearance = character.hairColor || character.hairColorHex || character.hairStyle || character.eyeColor || character.eyeColorHex;
  const hasSettings = character.personality || character.features || character.region || character.affiliation;
  const hasStory = character.foreshadowing || character.death;

  return (
    <div className="animate-fade-in">
      {/* Breadcrumb */}
      <Breadcrumb
        items={[
          { label: character.work.title, href: `/work/${workId}` },
          { label: character.name },
        ]}
      />

      {/* Hero */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-surface-200 bg-card shadow-card">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 p-6">
          <div className="relative h-40 w-full sm:h-48 sm:w-48 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-primary-50 to-surface-100">
            {character.imageUrl ? (
              <Image
                src={character.imageUrl}
                alt={character.name}
                fill
                unoptimized={character.imageUrl.startsWith("/uploads/")}
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 192px"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <UserIcon size={56} className="text-surface-300" />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="text-2xl font-bold text-surface-900">{character.name}</h1>
            {character.role && (
              <p className="mt-1.5 text-sm text-surface-500">{character.role}</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/work/${workId}/character/${characterId}/edit`}
                className="flex items-center gap-1.5 rounded-lg bg-surface-100 px-4 py-2 text-sm font-medium text-surface-700 transition-colors hover:bg-surface-200"
              >
                <PencilIcon size={15} />
                수정
              </Link>
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-danger-600 transition-colors hover:bg-danger-50"
              >
                <TrashIcon size={15} />
                삭제
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info Sections */}
      <div className="mt-4 space-y-4">
        {hasBasicInfo && (
          <InfoSection title="기본 정보">
            <InfoRow label="성별" value={character.gender} />
            <InfoRow label="생일" value={character.birthday} />
            <InfoRow label="나이" value={character.age} />
            <InfoRow label="키" value={character.height ? `${character.height}cm` : null} />
            <InfoRow label="체중" value={character.weight ? `${character.weight}kg` : null} />
          </InfoSection>
        )}

        {hasAppearance && (
          <InfoSection title="외형">
            <InfoRow label="머리색" value={character.hairColor} colorHex={character.hairColorHex} />
            <InfoRow label="헤어스타일" value={character.hairStyle} />
            <InfoRow label="눈색" value={character.eyeColor} colorHex={character.eyeColorHex} />
          </InfoSection>
        )}

        {hasSettings && (
          <InfoSection title="설정">
            <InfoRow label="성격" value={character.personality} />
            <InfoRow label="특징" value={character.features} />
            <InfoRow label="지역" value={character.region} />
            <InfoRow label="소속" value={character.affiliation} />
          </InfoSection>
        )}

        {hasStory && (
          <InfoSection title="스토리 관련">
            <InfoRow label="복선" value={character.foreshadowing} />
            <InfoRow label="사망" value={character.death} />
          </InfoSection>
        )}

        {character.notes && (
          <InfoSection title="기타">
            <InfoRow label="비고" value={character.notes} />
          </InfoSection>
        )}
      </div>
    </div>
  );
}
