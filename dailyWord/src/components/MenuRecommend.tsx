"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { pickRandomMenu, getCategoryEmoji, formatPrice } from "@/lib/menu";

export function MenuRecommend() {
  const [menu] = useState(() => pickRandomMenu());

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.0 }}
      className="w-full"
    >
      <p className="text-base text-muted-foreground mb-2 text-center">
        오늘의 추천메뉴
      </p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 15 }}
        className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50 shadow-sm"
      >
        {menu.image ? (
          <div className="relative w-16 h-16 rounded-xl overflow-hidden shrink-0 shadow-sm">
            <Image
              src={`/menu/${menu.image}`}
              alt={menu.name}
              fill
              className="object-cover"
              sizes="64px"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-background shadow-sm shrink-0">
            <span className="text-2xl">{getCategoryEmoji(menu.category)}</span>
          </div>
        )}

        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-base text-muted-foreground">{menu.category}</span>
          <span className="text-base font-bold text-foreground truncate">
            {menu.name}
          </span>
          <span className="text-base font-semibold text-primary">
            {formatPrice(menu.price)}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
