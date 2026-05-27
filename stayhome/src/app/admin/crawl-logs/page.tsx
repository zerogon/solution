import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CrawlStatus } from "@/generated/prisma/enums";
import { RefreshButton } from "@/components/admin/RefreshButton";

const STATUS_VARIANT: Record<
  CrawlStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  SUCCESS: "default",
  PARTIAL: "secondary",
  RUNNING: "outline",
  FAILED: "destructive",
};

export default async function CrawlLogsPage() {
  const [resorts, logs] = await Promise.all([
    prisma.resort.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { accounts: true } },
      },
    }),
    prisma.crawlLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">크롤링 로그</h1>
        <p className="text-sm text-muted-foreground">
          리조트별 수동 새로고침과 최근 50건의 동기화 결과입니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">수동 새로고침</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {resorts.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <div className="text-sm font-medium">{r.name}</div>
                {r.active ? (
                  <Badge variant="default" className="text-[10px]">active</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">inactive</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  계정 {r._count.accounts}개
                </span>
              </div>
              <RefreshButton slug={r.slug} label={r.name} />
            </div>
          ))}
        </CardContent>
      </Card>

      {logs.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 크롤링 이력이 없습니다.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>리조트</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>시작</TableHead>
                <TableHead>소요</TableHead>
                <TableHead>행수</TableHead>
                <TableHead>에러 단계</TableHead>
                <TableHead>메시지</TableHead>
                <TableHead>트리거</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.resortName}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[l.status]}>{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.startedAt.toLocaleString("ko-KR")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {l.durationMs != null ? `${l.durationMs}ms` : "-"}
                  </TableCell>
                  <TableCell className="text-xs">{l.rowsUpserted ?? "-"}</TableCell>
                  <TableCell className="text-xs">{l.errorStage ?? "-"}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                    {l.errorMessage ?? "-"}
                  </TableCell>
                  <TableCell className="text-xs">{l.triggeredBy ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
