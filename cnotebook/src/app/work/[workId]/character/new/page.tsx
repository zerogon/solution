"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import CharacterForm, { CharacterData } from "@/components/CharacterForm";
import Breadcrumb from "@/components/Breadcrumb";
import { useToast } from "@/components/Toast";

export default function NewCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const workId = params.workId as string;
  const { toast } = useToast();
  const [workTitle, setWorkTitle] = useState("");

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
  }, [fetchWork]);

  const handleSubmit = async (data: CharacterData) => {
    const res = await fetch("/api/character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, workId }),
    });

    if (res.ok) {
      const character = await res.json();
      toast("캐릭터가 생성되었습니다", "success");
      router.push(`/work/${workId}/character/${character.id}`);
    } else {
      const err = await res.json();
      toast(err.error, "error");
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-4">
        <Breadcrumb
          items={[
            { label: workTitle || "...", href: `/work/${workId}` },
            { label: "캐릭터 추가" },
          ]}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            New Character
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.022em] leading-[1.2] text-foreground">
            캐릭터 추가
          </h1>
        </div>
      </div>
      <CharacterForm onSubmit={handleSubmit} submitLabel="캐릭터 생성" />
    </div>
  );
}
