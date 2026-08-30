"use client";

import { useState } from "react";
import { ChevronDown, MapPin, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PlacePicker } from "./PlacePicker";
import {
  ALL_PLACES,
  candidateProperties,
  findProperty,
  isAllPlaces,
  placeLabel,
  type PlaceCounts,
  type PlaceSelection,
} from "./place-selection";
import type { ResortCatalogEntry } from "./types";

/**
 * 패널의 장소 컨트롤 — 필드 하나.
 *
 * 리조트·지역·지점 세 축이 여기 뒤로 전부 들어간다(`PlacePicker`). 예전에는 셋이
 * 패널에 나란히 펼쳐져 있었고, 옵션 16개(리조트 5 + 지역 11)가 세로의 절반을
 * 쓰면서 정작 옵션 57개인 지점 축은 한 줄이었다.
 *
 * ## 왜 두 갈래를 다 마운트하는가
 * `DateRangeField`와 같은 관례다 — 미디어쿼리 훅은 하이드레이션 불일치를 만들므로
 * CSS로만 분기한다.
 *
 * ## ⚠️ `open` 상태는 갈래마다 따로여야 한다
 * 팝오버와 시트의 본문은 **포털**로 나가므로 `hidden`이 막지 못한다. 상태를 하나로
 * 올려 두 갈래에 내려보내면, 데스크톱에서 팝오버를 여는 순간 시트의 백드롭과 포커스
 * 스코프까지 같이 마운트돼 화면이 잠긴다. 지금 안전한 이유는 **숨겨진 갈래는
 * 트리거가 클릭될 수 없어 애초에 열리지 않기** 때문이다. `useState`가 둘인 것은
 * 실수가 아니다.
 */
export function PlaceField({
  catalog,
  value,
  counts,
  onChange,
}: {
  catalog: ResortCatalogEntry[];
  value: PlaceSelection;
  /** 조회 전에는 undefined. */
  counts?: PlaceCounts;
  onChange: (next: PlaceSelection) => void;
}) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 지목된 지점(있다면). 두 줄을 어떻게 채울지가 여기서 갈린다.
  const pinned = value.property ? findProperty(catalog, value.property) : null;

  // 지점을 지목했으면 이름 자체가 범위이므로 숫자를 그리지 않는다. `candidateProperties`는
  // **일부러** `property`를 무시하므로(그 값이 요약 스탯의 분모다) 그대로 쓰면 필드가
  // "설악 쏘라노  4곳"이라고 말하게 된다 — 이름 하나 옆의 4는 그냥 틀렸다.
  const scope = pinned ? null : candidateProperties(value, catalog).length;
  const cleared = isAllPlaces(value);

  // 같은 엘리먼트를 두 트리거가 공유한다 — React 엘리먼트는 불변이라 안전하다.
  //
  // 두 줄짜리 카드인 것은 장식이 아니다. 이 필드는 패널의 **1순위 컨트롤**인데
  // (지점을 지목하는 것이 가장 잦은 흐름이다) 한 줄짜리 outline 버튼이던 동안에는
  // 아래 캘린더 카드·박수 카드와 같은 무게라 눈에 걸리지 않았다. 라벨 + 값 두 줄
  // 구성은 `NightsStepper`가 이미 쓰는 이 패널의 문법이고, 아이콘 타일과 조금 더 큰
  // 높이가 그 위에 위계를 얹는다.
  const face = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <MapPin className="size-4" />
      </span>
      {/* 지점을 지목했으면 위 줄이 리조트명을 맡는다. `placeLabel`을 한 줄에 그대로
          쓰면 "소노호텔앤리조트 · 소노벨 B·C 비발디파크"가 되고, 320px 패널에서는
          **정작 중요한 뒷부분이 잘린다.** 두 줄로 나누면 잘리는 쪽이 맥락(리조트)이 되고
          정체(지점)는 굵게 남는다. */}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-xs font-normal text-muted-foreground">
          {pinned ? pinned.resortName : "장소"}
        </span>
        <span className="block truncate text-sm font-semibold text-foreground">
          {pinned ? pinned.label : placeLabel(value, catalog)}
        </span>
      </span>
      {scope !== null && (
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {scope}곳
        </span>
      )}
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
    </>
  );

  return (
    // 해제 버튼은 트리거의 **형제**다. 트리거 안에 넣으면 버튼 중첩이라 무효 HTML이고,
    // Base UI의 Trigger는 실제로 <button>을 렌더한다.
    <div className="flex items-center gap-1.5">
      <div className="hidden min-w-0 flex-1 xl:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-3 px-3 py-2"
              />
            }
          >
            {face}
          </PopoverTrigger>
          {/* 폭을 직접 준다 — 이 프리미티브는 의도적으로 `w-(--anchor-width)`를
              쓰지 않고, 썼다면 20rem 패널에 눌려 목록이 못 산다. */}
          <PopoverContent
            align="start"
            sideOffset={6}
            className="w-[min(26rem,calc(100vw-2rem))]"
          >
            <PlacePicker
              catalog={catalog}
              value={value}
              counts={counts}
              onChange={onChange}
              onPick={(next) => {
                onChange(next);
                setPopoverOpen(false);
              }}
              autoFocusSearch
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-w-0 flex-1 xl:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                className="h-auto w-full justify-start gap-3 px-3 py-2"
              />
            }
          >
            {face}
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>장소 선택</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-4">
              <PlacePicker
                catalog={catalog}
                value={value}
                counts={counts}
                onChange={onChange}
                onPick={(next) => {
                  onChange(next);
                  setSheetOpen(false);
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {!cleared && (
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="장소 선택 해제"
          title="전체 지점으로"
          onClick={() => onChange(ALL_PLACES)}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
