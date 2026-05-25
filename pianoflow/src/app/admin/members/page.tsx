import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Role, UserStatus } from "@/generated/prisma/enums";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "관리자",
  TEACHER: "선생님",
  STUDENT: "학생",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "활성",
  DORMANT: "휴면",
  WITHDRAWN: "탈퇴",
};

export default async function MembersList() {
  const members = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>회원 목록 ({members.length}명)</CardTitle>
        <Link href="/admin/members/new" className={buttonVariants({ size: "default" })}>
          + 회원 등록
        </Link>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>로그인 ID</TableHead>
              <TableHead>역할</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">남은 횟수</TableHead>
              <TableHead className="text-right">상세</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-medium">{m.name}</TableCell>
                <TableCell className="font-mono text-xs">{m.loginId}</TableCell>
                <TableCell>
                  <Badge variant="outline">{ROLE_LABEL[m.role]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={m.status === UserStatus.ACTIVE ? "secondary" : "outline"}
                  >
                    {STATUS_LABEL[m.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{m.remainingLessons}</TableCell>
                <TableCell className="text-right">
                  <Link
                    href={`/admin/members/${m.id}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    관리
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
