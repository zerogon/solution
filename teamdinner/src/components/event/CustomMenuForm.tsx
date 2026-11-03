"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  onSubmit: (input: { name: string; price: number | null }) => Promise<unknown>;
  disabled?: boolean;
  variant?: "default" | "outline";
}

/** 네이버에 없는 메뉴를 이름·가격으로 추가한다. 추가하면 바로 내 장바구니에 1개 담긴다. */
export function CustomMenuForm({ onSubmit, disabled, variant = "outline" }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [pending, setPending] = useState(false);

  const priceNum = price.trim() === "" ? null : Number(price.replace(/[^\d]/g, ""));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={variant} className="w-full" disabled={disabled} />}>
        <PlusIcon data-icon="inline-start" /> 메뉴 직접 추가
      </DialogTrigger>
      <DialogContent>
        <form
          className="contents"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || pending) return;
            setPending(true);
            try {
              await onSubmit({ name: name.trim(), price: priceNum });
              setName("");
              setPrice("");
              setOpen(false);
            } finally {
              setPending(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>메뉴 직접 추가</DialogTitle>
            <DialogDescription>네이버 메뉴판에 없는 메뉴(주류·사이드 등)를 추가하고 바로 담습니다.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customName">메뉴 이름</Label>
              <Input
                id="customName"
                className="h-10"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customPrice">
                가격(원) <span className="font-normal text-muted-foreground">(모르면 비워 두기)</span>
              </Label>
              <Input
                id="customPrice"
                className="h-10 font-mono tabular-nums"
                inputMode="numeric"
                placeholder="예: 5000"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || !name.trim()}>
              추가하고 담기
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
