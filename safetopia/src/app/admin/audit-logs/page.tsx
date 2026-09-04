import Link from "next/link";
import { ScrollText } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { cn, formatKstDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditAction } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const ACTION_LABEL: Record<AuditAction, string> = {
  LOGIN: "로그인",
  CREATE_EMPLOYEE: "직원 등록",
  UPDATE_EMPLOYEE: "직원 수정",
  CHANGE_EMPLOYEE_STATUS: "재직 상태 변경",
  RESET_PASSWORD: "비밀번호 초기화",
  CHANGE_BRANCH: "지점 이동",
  CREATE_BRANCH: "지점 등록",
  UPDATE_BRANCH: "지점 수정",
  CHANGE_BRANCH_STATUS: "지점 상태 변경",
  GRANT_LEAVE: "연차 부여",
  ADJUST_LEAVE: "연차 조정",
  CARRY_OVER_LEAVE: "연차 이월",
  APPROVE_REQUEST: "신청 승인",
  REJECT_REQUEST: "신청 반려",
  CANCEL_REQUEST_ADMIN: "신청 취소(관리자)",
};

const GROUPS: { key: string; label: string; actions: AuditAction[] }[] = [
  { key: "", label: "전체", actions: [] },
  { key: "leave", label: "연차 처리", actions: ["APPROVE_REQUEST", "REJECT_REQUEST", "CANCEL_REQUEST_ADMIN", "GRANT_LEAVE", "ADJUST_LEAVE", "CARRY_OVER_LEAVE"] },
  { key: "employee", label: "직원", actions: ["CREATE_EMPLOYEE", "UPDATE_EMPLOYEE", "CHANGE_EMPLOYEE_STATUS", "RESET_PASSWORD", "CHANGE_BRANCH"] },
  { key: "branch", label: "지점", actions: ["CREATE_BRANCH", "UPDATE_BRANCH", "CHANGE_BRANCH_STATUS"] },
  { key: "login", label: "로그인", actions: ["LOGIN"] },
];

/** 감사 로그 조회(Phase 2 골격). 그룹 필터 + 페이지네이션. */
export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<{ g?: string; page?: string }> }) {
  const sp = await searchParams;
  const group = GROUPS.find((g) => g.key === (sp.g ?? "")) ?? GROUPS[0];
  const page = Math.max(1, Number(sp.page) || 1);

  const where = group.actions.length ? { action: { in: group.actions } } : {};
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (g: string, p: number) => `/admin/audit-logs?${new URLSearchParams({ ...(g ? { g } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;

  return (
    <div className="space-y-6">
      <PageHeader title="감사 로그" description="관리자 행위 이력. 누가 언제 무엇을 바꿨는지." />

      <div className="flex flex-wrap gap-1.5">
        {GROUPS.map((g) => (
          <Link
            key={g.key}
            href={href(g.key, 1)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              g.key === group.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {g.label}
          </Link>
        ))}
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={ScrollText} title="기록이 없습니다" />
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {logs.map((l) => (
              <li key={l.id} className="rounded-lg border bg-card px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="secondary">{ACTION_LABEL[l.action]}</Badge>
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{formatKstDateTime(l.createdAt)}</span>
                </div>
                <p className="mt-1">{l.description ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{l.actorName}</p>
              </li>
            ))}
          </ul>
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>시각</TableHead>
                    <TableHead>행위자</TableHead>
                    <TableHead>행위</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{formatKstDateTime(l.createdAt)}</TableCell>
                      <TableCell>{l.actorName}</TableCell>
                      <TableCell><Badge variant="secondary">{ACTION_LABEL[l.action]}</Badge></TableCell>
                      <TableCell className="max-w-md truncate" title={l.description ?? undefined}>{l.description ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{l.ip ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} render={<Link href={href(group.key, page - 1)} />} nativeButton={false}>이전</Button>
              <span className="font-mono tabular-nums">{page} / {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} render={<Link href={href(group.key, page + 1)} />} nativeButton={false}>다음</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
