"use client";

import { cn } from "@/lib/utils";
import { WordCard } from "./WordCard";
import { RandomCard } from "./RandomCard";

interface WordItem {
  id: number;
  word: string;
}

interface WordGridProps {
  words: WordItem[];
  highlightedIndex: number | null;
  selectedIndex: number | null;
  disabled: boolean;
  onSelectWord: (index: number) => void;
  onSelectRandom: () => void;
}

export function WordGrid({
  words,
  highlightedIndex,
  selectedIndex,
  disabled,
  onSelectWord,
  onSelectRandom,
}: WordGridProps) {
  const hasSelection = selectedIndex !== null;

  return (
    <div className={cn("grid grid-cols-3 gap-2.5 w-full max-w-sm")}>
      {words.map((w, i) => (
        <WordCard
          key={w.id}
          word={w.word}
          index={i}
          isHighlighted={highlightedIndex === i}
          isSelected={selectedIndex === i}
          isFaded={hasSelection && selectedIndex !== i}
          disabled={disabled}
          onSelect={() => onSelectWord(i)}
        />
      ))}
      <RandomCard
        index={words.length}
        isHighlighted={highlightedIndex === words.length}
        isFaded={hasSelection}
        disabled={disabled}
        onSelect={onSelectRandom}
      />
    </div>
  );
}
