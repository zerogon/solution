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
      <p className="text-xl text-muted-foreground mb-3 text-center">
        오늘의 추천메뉴
      </p>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, type: "spring", stiffness: 200, damping: 15 }}
        className="flex items-center gap-4 p-4 rounded-2xl bg-muted/50 shadow-sm"
      >
        {menu.image ? (
          <div className="relative w-20 h-20 rounded-xl overflow-hidden shrink-0 shadow-sm">
            <Image
              src={`/menu/${menu.image}`}
              alt={menu.name}
              fill
              className="object-cover"
              sizes="80px"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center w-20 h-20 rounded-xl bg-background shadow-sm shrink-0">
            <span className="text-4xl">{getCategoryEmoji(menu.category)}</span>
          </div>
        )}

        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-sm text-muted-foreground">{menu.category}</span>
          <span className="text-xl font-bold text-foreground truncate">
            {menu.name}
          </span>
          <span className="text-lg font-semibold text-primary">
            {formatPrice(menu.price)}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
}
