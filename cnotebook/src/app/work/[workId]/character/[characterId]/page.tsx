"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

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

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2">
      <span className="w-20 shrink-0 text-sm font-medium text-gray-500">{label}</span>
      <span className="text-sm whitespace-pre-wrap">{value}</span>
    </div>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const characterId = params.characterId as string;

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
    if (!confirm("캐릭터를 삭제하시겠습니까?")) return;
    await fetch(`/api/character/${characterId}`, { method: "DELETE" });
    router.push(`/work/${workId}`);
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-400">불러오는 중...</div>;
  }

  if (!character) {
    return <div className="py-12 text-center text-gray-400">캐릭터를 찾을 수 없습니다.</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/work/${workId}`} className="text-gray-400 hover:text-gray-600">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold">{character.name}</h1>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        {/* Top - Image, Name, Role */}
        <div className="flex gap-6">
          <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-xl bg-gray-100">
            {character.imageUrl ? (
              <Image
                src={character.imageUrl}
                alt={character.name}
                fill
                className="object-cover"
                sizes="160px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-5xl text-gray-300">
                👤
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold">{character.name}</h2>
            {character.role && (
              <p className="mt-1 text-sm text-gray-500">{character.role}</p>
            )}
          </div>
        </div>

        {/* Sections */}
        <div className="mt-6 space-y-6">
          {/* Basic Info */}
          <section>
            <h3 className="border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
              기본 정보
            </h3>
            <div className="mt-1">
              <InfoRow label="성별" value={character.gender} />
              <InfoRow label="생일" value={character.birthday} />
              <InfoRow label="나이" value={character.age} />
              <InfoRow label="키" value={character.height ? `${character.height}cm` : null} />
              <InfoRow label="체중" value={character.weight ? `${character.weight}kg` : null} />
            </div>
          </section>

          {/* Appearance */}
          <section>
            <h3 className="border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
              외형
            </h3>
            <div className="mt-1">
              <InfoRow label="머리색" value={character.hairColor} />
              <InfoRow label="헤어스타일" value={character.hairStyle} />
              <InfoRow label="눈색" value={character.eyeColor} />
            </div>
          </section>

          {/* Settings */}
          <section>
            <h3 className="border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
              설정
            </h3>
            <div className="mt-1">
              <InfoRow label="성격" value={character.personality} />
              <InfoRow label="특징" value={character.features} />
              <InfoRow label="지역" value={character.region} />
              <InfoRow label="소속" value={character.affiliation} />
            </div>
          </section>

          {/* Story */}
          <section>
            <h3 className="border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
              스토리 관련
            </h3>
            <div className="mt-1">
              <InfoRow label="복선" value={character.foreshadowing} />
              <InfoRow label="사망" value={character.death} />
            </div>
          </section>

          {/* Notes */}
          {character.notes && (
            <section>
              <h3 className="border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
                기타
              </h3>
              <div className="mt-1">
                <InfoRow label="비고" value={character.notes} />
              </div>
            </section>
          )}
        </div>

        {/* Actions */}
        <div className="mt-8 flex gap-3">
          <Link
            href={`/work/${workId}/character/${characterId}/edit`}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            수정
          </Link>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
