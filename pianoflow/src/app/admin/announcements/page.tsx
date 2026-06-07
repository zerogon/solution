import Link from "next/link";
import { Megaphone, Pin } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { formatKstDate } from "@/lib/slots";

export default async function AdminAnnouncements() {
  const [announcements, audience] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: [
        { isPinned: "desc" },
        { publishedAt: "desc" },
        { createdAt: "desc" },
      ],
      include: { _count: { select: { reads: true } } },
    }),
    // 읽음률 분모 = 공지를 보는 대상(활성 학생·선생님)
    prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        role: { in: [Role.STUDENT, Role.TEACHER] },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="공지사항"
        description={`전체 ${announcements.length}건`}
        action={
          <Link
            href="/admin/announcements/new"
            className={buttonVariants({ size: "default" })}
          >
            <Megaphone className="size-4" />
            공지 등록
          </Link>
        }
      />
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>게시일</TableHead>
                <TableHead className="text-right">읽음</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-1.5">
                      {a.isPinned && (
                        <Pin
                          aria-label="중요"
                          className="size-3.5 shrink-0 text-primary"
                        />
                      )}
                      <span className="line-clamp-1">{a.title}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    {a.isPublished ? (
                      <Badge variant="secondary">게시</Badge>
                    ) : (
                      <Badge variant="outline">숨김</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.isPublished && a.publishedAt
                      ? formatKstDate(a.publishedAt).replace(/-/g, ".")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {a._count.reads}/{audience}명
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/announcements/${a.id}`}
                      className={buttonVariants({ size: "sm", variant: "outline" })}
                    >
                      관리
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {announcements.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-sm text-muted-foreground"
                  >
                    등록된 공지가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
