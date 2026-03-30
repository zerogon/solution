"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import CharacterForm, { CharacterData } from "@/components/CharacterForm";
import Breadcrumb from "@/components/Breadcrumb";
import { SkeletonDetailPage } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";

export default function EditCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const characterId = params.characterId as string;
  const { toast } = useToast();

  const [initialData, setInitialData] = useState<Partial<CharacterData> | null>(null);
  const [charName, setCharName] = useState("");
  const [workTitle, setWorkTitle] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchWork = useCallback(async () => {
    try {
      const res = await fetch("/api/work");
      const works = await res.json();
      const list = Array.isArray(works) ? works : [];
      const work = list.find((w: { id: string; title: string }) => w.id === workId);
      if (work) setWorkTitle(work.title);
    } catch {
      /* ignore */
    }
  }, [workId]);

  useEffect(() => {
    fetchWork();
    fetch(`/api/character/${characterId}`)
      .then((res) => res.json())
      .then((data) => {
        setCharName(data.name || "");
        setInitialData({
          name: data.name || "",
          role: data.role || "",
          gender: data.gender || "",
          birthday: data.birthday || "",
          age: data.age?.toString() || "",
          height: data.height?.toString() || "",
          weight: data.weight?.toString() || "",
          hairColor: data.hairColor || "",
          hairColorHex: data.hairColorHex || "",
          hairStyle: data.hairStyle || "",
          eyeColor: data.eyeColor || "",
          eyeColorHex: data.eyeColorHex || "",
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
  }, [characterId, fetchWork]);

  const handleSubmit = async (data: CharacterData) => {
    const res = await fetch(`/api/character/${characterId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      toast("캐릭터가 수정되었습니다", "success");
      router.push(`/work/${workId}/character/${characterId}`);
    } else {
      const err = await res.json();
      toast(err.error, "error");
    }
  };

  if (loading) {
    return <SkeletonDetailPage />;
  }

  return (
    <div className="animate-fade-in">
      <Breadcrumb
        items={[
          { label: workTitle || "...", href: `/work/${workId}` },
          { label: charName, href: `/work/${workId}/character/${characterId}` },
          { label: "수정" },
        ]}
      />
      <h1 className="mt-3 text-2xl font-bold text-surface-900">캐릭터 수정</h1>
      <div className="mt-6 rounded-2xl border border-surface-200 bg-card p-6 shadow-card">
        <CharacterForm
          initialData={initialData || undefined}
          onSubmit={handleSubmit}
          submitLabel="수정 완료"
        />
      </div>
    </div>
  );
}
