"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BottomBar } from "@/components/event/BottomBar";
import { CartSummary } from "@/components/event/CartSummary";
import { CustomMenuForm } from "@/components/event/CustomMenuForm";
import { EventHeader } from "@/components/event/EventHeader";
import { MenuList } from "@/components/event/MenuList";
import { NameGate } from "@/components/event/NameGate";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { myQuantities, summarizeCart } from "@/lib/cart";
import { api } from "@/lib/client-api";
import type { EventPayload, PickDto } from "@/lib/events";
import { rememberEventAndNotify, setMemberNameAndNotify } from "@/lib/member";
import { useMemberName } from "@/lib/use-member";
import type { PickInput } from "@/lib/validators";

const POLL_MS = 5_000;

type Tab = "menu" | "cart";

/** 낙관적 갱신 — 서버 응답 전에 캐시의 picks를 요청대로 바꿔 둔다. */
function applyLocalPick(picks: PickDto[], input: PickInput): PickDto[] {
  const idx = picks.findIndex((p) => p.menuId === input.menuId && p.memberName === input.memberName);
  if (input.quantity === 0) return idx < 0 ? picks : picks.filter((_, i) => i !== idx);
  if (idx >= 0) return picks.map((p, i) => (i === idx ? { ...p, quantity: input.quantity } : p));
  const now = new Date().toISOString();
  return [
    ...picks,
    { id: -Date.now(), eventId: 0, menuId: input.menuId, memberName: input.memberName, quantity: input.quantity, createdAt: now, updatedAt: now },
  ];
}

export function EventView({ slug, initial }: { slug: string; initial: EventPayload }) {
  const qc = useQueryClient();
  const queryKey = useMemo(() => ["event", slug] as const, [slug]);

  const { data } = useQuery({
    queryKey,
    queryFn: () => api.getEvent(slug),
    initialData: initial,
    refetchInterval: POLL_MS,
  });

  // 이름 — localStorage를 외부 스토어로 구독한다. undefined는 hydration 전(서버 스냅샷).
  const stored = useMemberName();
  const nameLoaded = stored !== undefined;
  const memberName = stored ?? null;
  const [editingName, setEditingName] = useState(false);
  useEffect(() => {
    rememberEventAndNotify({ slug, title: data.event.title, placeName: data.event.placeName });
  }, [slug, data.event.title, data.event.placeName]);

  const [tab, setTab] = useState<Tab>("menu");

  const summary = useMemo(() => summarizeCart(data.menus, data.picks), [data.menus, data.picks]);
  const mine = useMemo(() => myQuantities(data.picks, memberName), [data.picks, memberName]);
  const { myQty, mySubtotal } = useMemo(() => {
    let q = 0;
    let s = 0;
    const priceById = new Map(data.menus.map((m) => [m.id, m.price]));
    for (const [menuId, qty] of mine) {
      q += qty;
      const p = priceById.get(menuId);
      if (p != null) s += p * qty;
    }
    return { myQty: q, mySubtotal: s };
  }, [mine, data.menus]);

  const pick = useMutation({
    mutationFn: (input: PickInput) => api.setPick(slug, input),
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<EventPayload>(queryKey);
      if (prev) qc.setQueryData<EventPayload>(queryKey, { ...prev, picks: applyLocalPick(prev.picks, input) });
      return { prev };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(err.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const changeQty = useCallback(
    (menuId: number, quantity: number) => {
      if (!memberName) {
        setEditingName(true);
        return;
      }
      pick.mutate({ menuId, memberName, quantity: Math.max(0, Math.min(99, quantity)) });
    },
    [memberName, pick],
  );

  const addCustom = useMutation({
    mutationFn: async (input: { name: string; price: number | null }) => {
      if (!memberName) throw new Error("이름을 먼저 입력해 주세요.");
      const menu = await api.addCustomMenu(slug, { ...input, memberName });
      await api.setPick(slug, { menuId: menu.id, memberName, quantity: 1 });
      return menu;
    },
    onSuccess: (menu) => {
      toast.success(`「${menu.name}」을(를) 추가하고 담았습니다`);
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(err.message),
  });

  const sync = useMutation({
    mutationFn: () => api.syncMenus(slug),
    onSuccess: (r) => {
      toast.success(`네이버 메뉴 ${r.menuCount}개를 다시 가져왔습니다`);
      qc.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(err.message),
  });

  const nameGateOpen = nameLoaded && (memberName === null || editingName);

  return (
    <div className="flex min-h-dvh flex-col">
      <EventHeader
        event={data.event}
        memberName={memberName}
        onChangeName={() => setEditingName(true)}
        onSync={() => sync.mutate()}
        syncing={sync.isPending}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-3 pb-28">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="menu">
              메뉴 <span className="font-mono text-xs tabular-nums opacity-70">{data.menus.length}</span>
            </TabsTrigger>
            <TabsTrigger value="cart">
              장바구니 <span className="font-mono text-xs tabular-nums opacity-70">{summary.totalQty}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="menu" className="pt-1">
            <MenuList
              menus={data.menus}
              mine={mine}
              byMenu={summary.byMenu}
              onChange={changeQty}
              disabled={!nameLoaded}
              emptySlot={
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                  <p className="text-sm">네이버에서 가져온 메뉴가 없습니다.</p>
                  <p className="text-xs">
                    메뉴판이 등록되지 않은 가게이거나 읽을 수 없는 형식입니다. 아래에서 직접 추가하거나, 우측 상단 메뉴에서
                    다시 가져오기를 눌러 보세요.
                  </p>
                </div>
              }
            />
            <div className="pt-4">
              <CustomMenuForm
                onSubmit={(input) => addCustom.mutateAsync(input)}
                disabled={!memberName}
                variant={data.menus.length === 0 ? "default" : "outline"}
              />
            </div>
          </TabsContent>

          <TabsContent value="cart" className="pt-1">
            <CartSummary summary={summary} memberName={memberName} mine={mine} onChange={changeQty} disabled={!nameLoaded} />
          </TabsContent>
        </Tabs>
      </main>

      <BottomBar
        summary={summary}
        myQty={myQty}
        mySubtotal={mySubtotal}
        tab={tab}
        onToggle={() => setTab(tab === "menu" ? "cart" : "menu")}
      />

      <NameGate
        open={nameGateOpen}
        current={memberName}
        placeName={data.event.placeName}
        onSubmit={(name) => {
          setMemberNameAndNotify(name);
          setEditingName(false);
        }}
        onClose={() => setEditingName(false)}
      />
    </div>
  );
}
