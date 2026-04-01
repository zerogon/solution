export interface MemoryCard {
  cardId: number;
  wordId: number;
  word: string;
  pairId: number;
  paletteIndex: number;
}

interface WordItem {
  id: number;
  word: string;
}

export function selectRandomWords(words: WordItem[], count: number): WordItem[] {
  const shuffled = [...words];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export function createShuffledDeck(selectedWords: WordItem[]): MemoryCard[] {
  const cards: MemoryCard[] = [];

  selectedWords.forEach((w, pairId) => {
    for (let copy = 0; copy < 2; copy++) {
      cards.push({
        cardId: pairId * 2 + copy,
        wordId: w.id,
        word: w.word,
        pairId,
        paletteIndex: pairId,
      });
    }
  });

  // Fisher-Yates shuffle
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  // Reassign cardId after shuffle to match position
  cards.forEach((card, i) => {
    card.cardId = i;
  });

  return cards;
}
