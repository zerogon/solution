"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

/**
 * 앵커에 붙는 비모달 팝업.
 *
 * `dropdown-menu.tsx`의 `Portal → Positioner → Popup` 구조를 그대로 옮긴 것이라
 * 같은 식구처럼 읽힌다. 차이는 둘뿐이고 둘 다 의도적이다:
 *
 * - **`w-(--anchor-width)`를 쓰지 않는다.** 그건 메뉴가 트리거 폭을 따라가는 동작이라,
 *   60px 사이드바 레일에 붙으면 팝업이 60px로 눌린다. 여기서는 내용이 폭을 정한다.
 * - **`Menu`가 아니라 `Popover`다.** `Menu`는 roving tabindex와 방향키 *항목* 이동을
 *   가진 복합 위젯이고, 그 안에 달력(`role="grid"`, 방향키가 *날짜* 이동)을 넣으면
 *   둘이 같은 키를 두고 싸운다. `Popover.Popup`은 포커스 스코프만 갖는 `role="dialog"`다.
 */
function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 max-h-(--available-height) origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn(
        "font-heading text-sm font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  )
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverClose }
