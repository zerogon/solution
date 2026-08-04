"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, KeyRound, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { AccountFormDialog } from "./AccountFormDialog";
import { RevealDialog } from "./RevealDialog";
import { deleteResortAccount } from "@/actions/accounts";

export type AccountRow = {
  id: string;
  resortId: string;
  resortName: string;
  resortSlug: string;
  label: string;
  memo: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResortOption = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
};

/**
 * ID/비밀번호는 여기서 절대 평문으로 그리지 않는다. 마스킹된 자리표시자만 두고,
 * 복호화는 `RevealDialog` → `/api/admin/accounts/[id]/reveal` 경로로만 이뤄진다
 * (그 호출이 감사 로그를 남긴다).
 */
const MASK = "••••••••";

export function AccountTable({
  accounts,
  resorts,
}: {
  accounts: AccountRow[];
  resorts: ResortOption[];
}) {
  const [revealId, setRevealId] = useState<string | null>(null);
  const [revealLabel, setRevealLabel] = useState<string>("");

  async function handleDelete(id: string, label: string) {
    if (!confirm(`"${label}" 계정을 삭제할까요?`)) return;
    try {
      await deleteResortAccount(id);
      toast.success("삭제되었습니다");
    } catch (e) {
      toast.error("삭제 실패");
      console.error(e);
    }
  }

  function openReveal(a: AccountRow) {
    setRevealId(a.id);
    setRevealLabel(`${a.resortName} · ${a.label}`);
  }

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={KeyRound}
            title="등록된 리조트 계정이 없습니다"
            description="우측 상단의 ‘계정 추가’ 버튼으로 첫 계정을 등록하세요."
          />
        </CardContent>
      </Card>
    );
  }

  const actions = (a: AccountRow) => (
    <>
      <Button size="sm" variant="ghost" onClick={() => openReveal(a)}>
        <Eye className="size-3.5" />
        보기
      </Button>
      <AccountFormDialog
        mode="edit"
        resorts={resorts}
        existing={a}
        trigger={
          <Button size="icon-sm" variant="ghost" aria-label="수정">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="삭제"
        onClick={() => handleDelete(a.id, a.label)}
      >
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </>
  );

  return (
    <>
      {/* 모바일: 카드 목록. 6열 테이블은 390px에서 읽을 수 없다. */}
      <ul className="space-y-2 md:hidden">
        {accounts.map((a) => (
          <li key={a.id}>
            <Card size="sm">
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {a.resortName}
                      </span>
                      {a.isPrimary && (
                        <Badge variant="secondary" className="text-[10px]">
                          primary
                        </Badge>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {a.label}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">{actions(a)}</div>
                </div>
                <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
                  <span>ID {MASK}</span>
                  <span>PW {MASK}</span>
                </div>
                {a.memo && (
                  <p className="truncate text-xs text-muted-foreground">{a.memo}</p>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* 데스크톱: 테이블 */}
      <div className="hidden overflow-hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>리조트</TableHead>
              <TableHead>라벨</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>비밀번호</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="w-[190px] text-right">작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{a.resortName}</span>
                    {a.isPrimary && (
                      <Badge variant="secondary" className="text-[10px]">
                        primary
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>{a.label}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{MASK}</TableCell>
                <TableCell className="font-mono text-muted-foreground">{MASK}</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {a.memo ?? "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    {actions(a)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RevealDialog
        accountId={revealId}
        title={revealLabel}
        onClose={() => setRevealId(null)}
      />
    </>
  );
}
