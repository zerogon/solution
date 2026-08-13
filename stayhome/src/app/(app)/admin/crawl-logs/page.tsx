import { ScrollText } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { formatKstDateTime } from "@/lib/utils";
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
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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

const LOG_LIMIT = 50;

// 서버 컴포넌트가 렌더하므로 서버 타임존(Vercel=UTC)이 그대로 나온다 — KST 고정.
const formatStarted = formatKstDateTime;

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
      take: LOG_LIMIT,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="크롤링 로그"
        description={`리조트별 수동 새로고침과 최근 ${LOG_LIMIT}건의 동기화 결과입니다.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>수동 새로고침</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {resorts.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{r.name}</span>
                <Badge
                  variant={r.active ? "default" : "secondary"}
                  className="text-[10px]"
                >
                  {r.active ? "active" : "inactive"}
                </Badge>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  계정 {r._count.accounts}
                </span>
              </div>
              <RefreshButton slug={r.slug} label={r.name} />
            </div>
          ))}
        </CardContent>
      </Card>

      {logs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={ScrollText}
              title="아직 크롤링 이력이 없습니다"
              description="위의 ‘새로고침’을 눌러 첫 수집을 실행하면 여기에 결과가 쌓입니다."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 모바일: 로그 1건 = 카드 1개. 8열 테이블은 폰 폭에서 가로로 터진다. */}
          <ul className="space-y-2 md:hidden">
            {logs.map((l) => (
              <li key={l.id}>
                <Card size="sm">
                  <CardContent className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {l.resortName}
                      </span>
                      <Badge variant={STATUS_VARIANT[l.status]}>{l.status}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                      <span>{formatStarted(l.startedAt)}</span>
                      <span>{l.durationMs != null ? `${l.durationMs}ms` : "-"}</span>
                      <span>{l.rowsUpserted ?? 0}행</span>
                      {l.triggeredBy && (
                        <span className="font-sans">{l.triggeredBy}</span>
                      )}
                    </div>
                    {l.errorMessage && (
                      <p className="text-xs text-destructive">
                        {l.errorStage ? `[${l.errorStage}] ` : ""}
                        {l.errorMessage}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {/* 데스크톱: 전체 열 테이블. Table 자체가 overflow-x-auto 컨테이너를 갖는다. */}
          <div className="hidden overflow-hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>리조트</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>시작</TableHead>
                  <TableHead className="text-right">소요</TableHead>
                  <TableHead className="text-right">행수</TableHead>
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
                    <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatStarted(l.startedAt)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {l.durationMs != null ? `${l.durationMs}ms` : "-"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {l.rowsUpserted ?? "-"}
                    </TableCell>
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
        </>
      )}
    </div>
  );
}
