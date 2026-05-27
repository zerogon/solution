"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  if (accounts.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        등록된 리조트 계정이 없습니다. 우측 상단의 "계정 추가" 버튼으로 시작하세요.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>리조트</TableHead>
              <TableHead>라벨</TableHead>
              <TableHead>ID</TableHead>
              <TableHead>비밀번호</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="w-[200px] text-right">작업</TableHead>
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
                <TableCell className="font-mono text-muted-foreground">********</TableCell>
                <TableCell className="font-mono text-muted-foreground">********</TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {a.memo ?? "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRevealId(a.id);
                        setRevealLabel(`${a.resortName} · ${a.label}`);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                      <span className="ml-1">보기</span>
                    </Button>
                    <AccountFormDialog
                      mode="edit"
                      resorts={resorts}
                      existing={a}
                      trigger={
                        <Button size="sm" variant="ghost">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(a.id, a.label)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
