"use client";

import { SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { MenuCard } from "@/components/event/MenuCard";
import { Input } from "@/components/ui/input";
import type { MenuAggregate } from "@/lib/cart";
import type { MenuDto } from "@/lib/events";

interface Props {
  menus: MenuDto[];
  mine: Map<number, number>;
  byMenu: MenuAggregate[];
  onChange: (menuId: number, qty: number) => void;
  disabled?: boolean;
  emptySlot?: React.ReactNode;
}

export function MenuList({ menus, mine, byMenu, onChange, disabled, emptySlot }: Props) {
  const [q, setQ] = useState("");
  const aggById = useMemo(() => new Map(byMenu.map((a) => [a.menu.id, a])), [byMenu]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return menus;
    return menus.filter(
      (m) => m.name.toLowerCase().includes(needle) || (m.description ?? "").toLowerCase().includes(needle),
    );
  }, [menus, q]);

  // 네이버 분류가 있으면 구간 헤더로 보여 준다. 분류명이 비어 있으면(미분류) 헤더 없음. 검색 중엔 헤더 없음.
  const rows = useMemo(() => {
    const out: { menu: MenuDto; header: string | null }[] = [];
    let last: string | null = null;
    for (const m of filtered) {
      const cat = m.categoryName?.trim() || null;
      out.push({ menu: m, header: cat !== null && cat !== last && !q.trim() ? cat : null });
      last = cat;
    }
    return out;
  }, [filtered, q]);

  if (menus.length === 0) return <>{emptySlot}</>;

  return (
    <div className="flex flex-col gap-3">
      {menus.length > 6 && (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="메뉴 검색"
            className="h-9 bg-card pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="메뉴 검색"
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">「{q}」에 맞는 메뉴가 없습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(({ menu: m, header }) => {
            const agg = aggById.get(m.id);
            return (
              <div key={m.id} className="contents">
                {header && (
                  <li className="list-none pt-2 pb-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:pt-0">
                    {header}
                  </li>
                )}
                <MenuCard
                  menu={m}
                  myQty={mine.get(m.id) ?? 0}
                  totalQty={agg?.totalQty ?? 0}
                  memberCount={agg?.members.length ?? 0}
                  onChange={(qty) => onChange(m.id, qty)}
                  disabled={disabled}
                />
              </div>
            );
          })}
        </ul>
      )}
    </div>
  );
}
