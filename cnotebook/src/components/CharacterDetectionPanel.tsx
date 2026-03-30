"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronUpIcon, ChevronDownIcon, UserIcon, XIcon } from "./Icons";

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
}

interface Props {
  characters: DetectedCharacter[];
  workId: string;
}

export default function CharacterDetectionPanel({ characters, workId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const prevCountRef = useRef(characters.length);

  // Auto-select first new character when detection changes
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
    <div className="fixed bottom-0 left-0 right-0 z-40 border-t-2 border-primary-400 bg-card shadow-modal">
      {/* Always-visible chip bar */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="shrink-0 rounded-md bg-primary-600 px-2 py-0.5 text-xs font-bold text-white">
          {characters.length}
        </span>

        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-hidden">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() =>
                setSelectedId(selected?.id === char.id ? null : char.id)
              }
              className={`rounded-full px-3 py-1 text-sm font-medium transition-all ${
                selected?.id === char.id
                  ? "bg-primary-600 text-white shadow-card"
                  : "bg-primary-50 text-primary-700 hover:bg-primary-100"
              }`}
            >
              {char.name}
              {char.role && (
                <span
                  className={`ml-2 text-xs ${
                    selected?.id === char.id
                      ? "text-primary-200"
                      : "text-primary-400"
                  }`}
                >
                  {char.role}
                </span>
              )}
            </button>
          ))}
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-lg p-1 text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Expanded character detail */}
      {selected && (
        <div className="animate-fade-in border-t border-surface-100 px-4 pb-4 pt-3">
          <div className="flex gap-4 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-primary-200 bg-white">
              {selected.imageUrl ? (
                <Image
                  src={selected.imageUrl}
                  alt={selected.name}
                  width={64}
                  height={64}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-primary-300">
                  <UserIcon size={28} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-surface-900">{selected.name}</h4>
                {selected.role && (
                  <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                    {selected.role}
                  </span>
                )}
                {selected.gender && (
                  <span className="text-sm text-surface-500">
                    {selected.gender}
                  </span>
                )}
                {selected.age && (
                  <span className="text-sm text-surface-500">
                    {selected.age}세
                  </span>
                )}
              </div>

              {selected.personality && (
                <p className="mt-1.5 line-clamp-1 text-sm text-surface-600">
                  <span className="font-semibold text-surface-700">성격</span>{" "}
                  {selected.personality}
                </p>
              )}
              {selected.features && (
                <p className="mt-0.5 line-clamp-1 text-sm text-surface-600">
                  <span className="font-semibold text-surface-700">특징</span>{" "}
                  {selected.features}
                </p>
              )}

              <Link
                href={`/work/${workId}/character/${selected.id}`}
                target="_blank"
                className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 transition-colors hover:text-primary-700"
              >
                상세보기 &rarr;
              </Link>
            </div>

            <button
              onClick={() => setSelectedId(null)}
              className="self-start rounded-lg p-1 text-surface-300 transition-colors hover:bg-surface-100 hover:text-surface-500"
            >
              <ChevronDownIcon size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
