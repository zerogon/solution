"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import CharacterDetectionPanel, {
  type DetectedCharacter,
} from "./CharacterDetectionPanel";
import { Check, Loader } from "lucide-react";
import { Separator } from "@/components/ui/separator";

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

interface Props {
  manuscriptId: string;
  initialTitle: string;
  initialContent: string;
}

function getSearchNames(char: DetectedCharacter): string[] {
  const names = [char.name];
  if (char.aliases) {
    for (const alias of char.aliases.split(",")) {
      const trimmed = alias.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

function detectCharacters(
  text: string,
  characters: DetectedCharacter[]
): DetectedCharacter[] {
  if (!text.trim()) return [];

  const detected: DetectedCharacter[] = [];
  for (const char of characters) {
    const names = getSearchNames(char);
    const found = names.some((n) => n.length >= 2 && text.includes(n));
    if (found) {
      detected.push(char);
    }
  }
  return detected;
}

export default function WritingEditor({
  manuscriptId,
  initialTitle,
  initialContent,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [allCharacters, setAllCharacters] = useState<DetectedCharacter[]>([]);
  const [detectedCharacters, setDetectedCharacters] = useState<
    DetectedCharacter[]
  >([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef(initialContent);
  const titleRef = useRef(initialTitle);
  const isSavingRef = useRef(false);

  // Fetch characters across all works
  useEffect(() => {
    const fetchCharacters = async () => {
      try {
        const res = await fetch(`/api/character`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllCharacters(
            data.map(
              (c: {
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
              }) => ({
                id: c.id,
                name: c.name,
                role: c.role,
                gender: c.gender,
                age: c.age,
                personality: c.personality,
                features: c.features,
                aliases: c.aliases,
                imageUrl: c.imageUrl,
                work: c.work,
              })
            )
          );
        }
      } catch {
        /* ignore */
      }
    };
    fetchCharacters();
  }, []);

  // Run initial detection once characters are loaded
  useEffect(() => {
    if (allCharacters.length > 0 && content) {
      setDetectedCharacters(detectCharacters(content, allCharacters));
    }
  }, [allCharacters]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setSaveStatus("saving");

    try {
      const res = await fetch(`/api/manuscript/${manuscriptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: titleRef.current,
          content: contentRef.current,
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      isSavingRef.current = false;
    }
  }, [manuscriptId]);

  const scheduleDetection = useCallback(() => {
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    detectTimerRef.current = setTimeout(() => {
      setDetectedCharacters(
        detectCharacters(contentRef.current, allCharacters)
      );
    }, 300);
  }, [allCharacters]);

  const scheduleSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save();
    }, 2000);
  }, [save]);

  const handleContentChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const newContent = e.target.value;
    setContent(newContent);
    contentRef.current = newContent;
    scheduleDetection();
    scheduleSave();
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    titleRef.current = newTitle;
    scheduleSave();
  };

  // Ctrl+S / Cmd+S immediate save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        setDetectedCharacters(
          detectCharacters(contentRef.current, allCharacters)
        );
        save();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [save, allCharacters]);

  // beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    };
  }, []);

  // Bottom padding when panel is shown
  const bottomPadding = detectedCharacters.length > 0 ? "pb-20" : "pb-8";

  return (
    <div className={`flex flex-col ${bottomPadding} transition-all`}>
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={handleTitleChange}
        placeholder="제목을 입력하세요"
        className="border-0 border-b border-border bg-transparent px-1 py-3 text-[1.75rem] font-semibold tracking-[-0.02em] leading-[1.2] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none"
      />

      {/* Editor */}
      <textarea
        value={content}
        onChange={handleContentChange}
        placeholder="여기에 글을 쓰세요…"
        className="mt-6 min-h-[calc(100vh-320px)] w-full resize-none bg-transparent px-1 text-[17px] leading-[1.85] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
        style={{ fontFamily: "var(--font-sans)" }}
      />

      {/* Status bar */}
      <Separator className="mt-4" />
      <div className="mt-2 flex items-center justify-between text-xs tabular-nums text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {saveStatus === "saved" && (
            <>
              <Check className="size-3 text-success-500" />
              <span>저장됨</span>
            </>
          )}
          {saveStatus === "saving" && (
            <>
              <Loader className="size-3 animate-spin" />
              <span>저장 중…</span>
            </>
          )}
          {saveStatus === "unsaved" && <span>저장 대기</span>}
          {saveStatus === "error" && (
            <span className="text-destructive">저장 실패</span>
          )}
        </div>
        <span>{content.length.toLocaleString()}자</span>
      </div>

      {/* Character detection panel */}
      <CharacterDetectionPanel characters={detectedCharacters} />
    </div>
  );
}
