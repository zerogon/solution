"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CharacterForm, { CharacterData } from "@/components/CharacterForm";

export default function EditCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const characterId = params.characterId as string;

  const [initialData, setInitialData] = useState<Partial<CharacterData> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/character/${characterId}`)
      .then((res) => res.json())
      .then((data) => {
        setInitialData({
          name: data.name || "",
          role: data.role || "",
          gender: data.gender || "",
          birthday: data.birthday || "",
          age: data.age?.toString() || "",
          height: data.height?.toString() || "",
          weight: data.weight?.toString() || "",
          hairColor: data.hairColor || "",
          hairStyle: data.hairStyle || "",
          eyeColor: data.eyeColor || "",
          personality: data.personality || "",
          features: data.features || "",
          region: data.region || "",
          affiliation: data.affiliation || "",
          foreshadowing: data.foreshadowing || "",
          death: data.death || "",
          notes: data.notes || "",
          imageUrl: data.imageUrl || "",
        });
        setLoading(false);
      });
  }, [characterId]);

  const handleSubmit = async (data: CharacterData) => {
    const res = await fetch(`/api/character/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      router.push(`/work/${workId}/character/${characterId}`);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-400">불러오는 중...</div>;
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link
          href={`/work/${workId}/character/${characterId}`}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr;
        </Link>
        <h1 className="text-2xl font-bold">캐릭터 수정</h1>
      </div>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <CharacterForm
          initialData={initialData || undefined}
          onSubmit={handleSubmit}
          submitLabel="수정 완료"
        />
      </div>
    </div>
  );
}
