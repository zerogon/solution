"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, History, Lock, Repeat, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AgendaRail,
  type AgendaGroup,
  type AgendaTone,
} from "@/components/schedule/AgendaRail";
import { EmptyState } from "@/components/empty-state";
import { MemberStatusBadge } from "@/components/member-status-badge";
import type { UserStatus } from "@/generated/prisma/enums";
import {
  adminGetStudentReservations,
  type AdminStudentReservationGroup,
  type AdminStudentReservationItem,
} from "@/actions/members";

export interface StudentRowData {
  id: string;
  name: string;
  note: string | null;
  loginId: string;
  status: UserStatus;
}

function statusBadge(status: AdminStudentReservationItem["status"]) {
  switch (status) {
    case "cancelled":
      return (
        <Badge variant="destructive">
          <X aria-hidden className="size-3" />
          취소됨
        </Badge>
      );
    case "done":
      return (
        <Badge variant="secondary">
          <Check aria-hidden className="size-3" />
          완료
        </Badge>
      );
    case "upcoming":
      return (
        <Badge variant="outline">
          <Lock aria-hidden className="size-3" />
          예정
        </Badge>
      );
  }
}

/** 학생 행 클릭 → 학생이 로그인해 보는 예약 내역을 팝업으로 미리보기 */
export function StudentRows({ students }: { students: StudentRowData[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<StudentRowData | null>(null);
  const [groups, setGroups] = useState<AdminStudentReservationGroup[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openPreview(student: StudentRowData) {
    setSelected(student);
    setGroups(null);
    setError(null);
    setOpen(true);
    startTransition(async () => {
      const res = await adminGetStudentReservations({ studentId: student.id });
      if (res.ok) setGroups(res.data?.groups ?? []);
      else setError(res.message);
    });
  }

  const agendaGroups: AgendaGroup[] = (groups ?? []).map((g) => ({
    label: g.month,
    items: g.items.map((it) => {
      const tone: AgendaTone = it.status === "upcoming" ? "default" : "muted";
      return {
        id: it.id,
        time: it.timeLabel,
        title: `${it.teacherName} 선생님`,
        tone,
        icon: it.isRecurring ? (
          <Repeat aria-hidden className="size-3.5 shrink-0 text-primary/70" />
        ) : undefined,
        trailing: statusBadge(it.status),
      };
    }),
  }));

  return (
    <>
      {students.map((m) => (
        <TableRow
          key={m.id}
          className="cursor-pointer"
          onClick={() => openPreview(m)}
        >
          <TableCell className="font-medium">
            {m.name}
            {m.note && (
              <p className="max-w-[16rem] truncate text-xs font-normal text-muted-foreground">
                {m.note}
              </p>
            )}
          </TableCell>
          <TableCell className="font-mono text-xs">{m.loginId}</TableCell>
          <TableCell>
            <MemberStatusBadge status={m.status} />
          </TableCell>
          <TableCell className="text-right">
            <Link
              href={`/admin/members/${m.id}`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
              onClick={(e) => e.stopPropagation()}
            >
              관리
            </Link>
          </TableCell>
        </TableRow>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name} 학생 · 예약 내역</DialogTitle>
            <DialogDescription>
              학생 화면에 표시되는 최근 50건의 레슨 기록입니다.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {pending ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                불러오는 중...
              </p>
            ) : error ? (
              <p className="py-8 text-center text-sm text-destructive">
                {error}
              </p>
            ) : agendaGroups.length === 0 ? (
              <EmptyState icon={History} title="예약 내역이 없습니다" />
            ) : (
              <AgendaRail groups={agendaGroups} />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
