"use client";

import { MemoryCard } from "./MemoryCard";
import type { MemoryCard as MemoryCardType } from "@/lib/gameUtils";

interface MemoryGridProps {
  cards: MemoryCardType[];
  faceUpIds: Set<number>;
  matchedIds: Set<number>;
  disabled: boolean;
  onFlipCard: (cardId: number) => void;
}

export function MemoryGrid({
  cards,
  faceUpIds,
  matchedIds,
  disabled,
  onFlipCard,
}: MemoryGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2.5 w-full max-w-md">
      {cards.map((card) => (
        <MemoryCard
          key={card.cardId}
          card={card}
          isFaceUp={faceUpIds.has(card.cardId)}
          isMatched={matchedIds.has(card.cardId)}
          disabled={disabled}
          onFlip={() => onFlipCard(card.cardId)}
        />
      ))}
    </div>
  );
}
