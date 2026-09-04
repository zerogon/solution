import { MapPin, Pencil, Plus, Store } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { BRANCH_STATUS_LABEL, WEEKDAY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BranchFormDialog } from "@/components/admin/BranchFormDialog";
import { BranchStatusButton } from "@/components/admin/BranchStatusButton";
import { BranchStatus, EmployeeStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const branches = await prisma.branch.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: { where: { status: EmployeeStatus.ACTIVE } } } } },
  });

  const closedLabel = (days: number[]) =>
    days.length === 0 ? "휴무 없음" : `${days.map((d) => WEEKDAY_LABEL[d]).join("·")} 휴무`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="지점 관리"
        description="지점의 정기 휴무 요일은 직원 연차 차감 일수에서 자동으로 제외됩니다."
        action={
          <BranchFormDialog
            trigger={
              <Button>
                <Plus data-icon="inline-start" />
                지점 등록
              </Button>
            }
          />
        }
      />

      {branches.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Store} title="등록된 지점이 없습니다" description="먼저 지점을 등록한 뒤 직원을 배정하세요." />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 모바일: 카드 */}
          <ul className="space-y-3 md:hidden">
            {branches.map((b) => (
              <li key={b.id}>
                <Card className={cn(b.status === BranchStatus.INACTIVE && "opacity-60")}>
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{b.name}</span>
                          <Badge variant={b.status === BranchStatus.ACTIVE ? "secondary" : "outline"}>
                            {BRANCH_STATUS_LABEL[b.status]}
                          </Badge>
                        </div>
                        {b.address && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="size-3" />
                            {b.address}
                          </p>
                        )}
                      </div>
                      <BranchFormDialog
                        initial={b}
                        trigger={
                          <Button variant="ghost" size="icon-sm" aria-label="수정">
                            <Pencil />
                          </Button>
                        }
                      />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        재직 <span className="font-mono tabular-nums">{b._count.users}</span>명 · {closedLabel(b.closedWeekdays)}
                        {b.minStaff !== null && ` · 최소 ${b.minStaff}명`}
                      </span>
                      <BranchStatusButton id={b.id} status={b.status} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {/* 데스크톱: 테이블 */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>지점</TableHead>
                    <TableHead>주소</TableHead>
                    <TableHead>연락처</TableHead>
                    <TableHead>휴무</TableHead>
                    <TableHead className="text-right">재직</TableHead>
                    <TableHead className="text-right">최소 인원</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((b) => (
                    <TableRow key={b.id} className={cn(b.status === BranchStatus.INACTIVE && "opacity-60")}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell className="text-muted-foreground">{b.address ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">{b.phone ?? "—"}</TableCell>
                      <TableCell>{closedLabel(b.closedWeekdays)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{b._count.users}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{b.minStaff ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={b.status === BranchStatus.ACTIVE ? "secondary" : "outline"}>
                          {BRANCH_STATUS_LABEL[b.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <BranchFormDialog
                            initial={b}
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label="수정">
                                <Pencil />
                              </Button>
                            }
                          />
                          <BranchStatusButton id={b.id} status={b.status} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
