"use client";

import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client-api";

export function CreateEventForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [naverUrl, setNaverUrl] = useState("");

  const create = useMutation({
    mutationFn: () => api.createEvent({ title: title.trim() || undefined, naverUrl: naverUrl.trim() }),
    onSuccess: (result) => {
      if (result.menuCount === 0) {
        toast.warning("메뉴판을 가져오지 못했습니다", {
          description: "네이버에 메뉴가 등록돼 있지 않거나 읽을 수 없는 형식입니다. 메뉴를 직접 추가할 수 있습니다.",
        });
      } else {
        toast.success(`메뉴 ${result.menuCount}개를 가져왔습니다`);
      }
      router.push(`/e/${result.slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!naverUrl.trim() || create.isPending) return;
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="naverUrl">네이버 지도 링크</Label>
            <div className="relative">
              <LinkIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="naverUrl"
                inputMode="url"
                autoComplete="off"
                placeholder="https://naver.me/… 또는 map.naver.com/p/entry/place/…"
                className="h-10 pl-8"
                value={naverUrl}
                onChange={(e) => setNaverUrl(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              회식 이름 <span className="font-normal text-muted-foreground">(선택)</span>
            </Label>
            <Input
              id="title"
              placeholder="비우면 「식당명 회식」으로 정해집니다"
              className="h-10"
              maxLength={40}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <Button type="submit" size="lg" className="h-11 text-base" disabled={create.isPending || !naverUrl.trim()}>
            {create.isPending ? (
              <>
                <Loader2Icon className="animate-spin" /> 메뉴판 가져오는 중…
              </>
            ) : (
              "회식 만들기"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
