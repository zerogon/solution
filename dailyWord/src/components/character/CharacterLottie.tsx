"use client";

import { useState, useEffect } from "react";
import Lottie from "lottie-react";

interface CharacterLottieProps {
  url: string;
  fallbackEmoji: string;
  size?: number;
  loop?: boolean;
}

export function CharacterLottie({
  url,
  fallbackEmoji,
  size = 120,
  loop = true,
}: CharacterLottieProps) {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error || !animationData) {
    return (
      <span className="select-none" style={{ fontSize: size * 0.6 }}>
        {fallbackEmoji}
      </span>
    );
  }

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      style={{ width: size, height: size }}
    />
  );
}
