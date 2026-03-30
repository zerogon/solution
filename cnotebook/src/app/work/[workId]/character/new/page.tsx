"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import CharacterForm, { CharacterData } from "@/components/CharacterForm";

export default function NewCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;

  const handleSubmit = async (data: CharacterData) => {
    const res = await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, workId }),
    });

    if (res.ok) {
      const character = await res.json();
      router.push(`/work/${workId}/character/${character.id}`);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <Link href={`/work/${workId}`} className="text-gray-400 hover:text-gray-600">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold">캐릭터 추가</h1>
      </div>
      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <CharacterForm onSubmit={handleSubmit} submitLabel="캐릭터 생성" />
      </div>
    </div>
  );
}
