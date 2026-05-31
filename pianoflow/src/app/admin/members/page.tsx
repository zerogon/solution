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
import { formatKstDate } from "@/lib/slots";

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

const ROLE_FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: Role.STUDENT, label: "학생" },
  { value: Role.TEACHER, label: "선생님" },
  { value: Role.ADMIN, label: "관리자" },
];

interface PageProps {
  searchParams: Promise<{ q?: string; role?: string }>;
}

function StatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge variant={status === UserStatus.ACTIVE ? "secondary" : "outline"}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

function DetailLink({ id }: { id: string }) {
  return (
    <Link
      href={`/admin/members/${id}`}
      className={buttonVariants({ size: "sm", variant: "outline" })}
    >
      관리
    </Link>
  );
}

export default async function MembersList({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "";
  const roleFilter =
    sp.role === Role.STUDENT || sp.role === Role.TEACHER || sp.role === Role.ADMIN
      ? sp.role
      : "ALL";

  const members = await prisma.user.findMany({
    where: {
      ...(roleFilter !== "ALL" ? { role: roleFilter } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { loginId: { contains: q } },
            ],
          }
        : {}),
    },
    include: { availability: true },
    orderBy: { name: "asc" },
  });

  const students = members.filter((m) => m.role === Role.STUDENT);
  const teachers = members.filter((m) => m.role === Role.TEACHER);
  const admins = members.filter((m) => m.role === Role.ADMIN);

  const show = (role: Role) => roleFilter === "ALL" || roleFilter === role;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-row items-center justify-between">
            <CardTitle>회원 ({members.length}명)</CardTitle>
            <Link
              href="/admin/members/new"
              className={buttonVariants({ size: "default" })}
            >
              + 회원 등록
            </Link>
          </div>

          <form method="get" className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="이름 · 휴대폰 · 로그인 ID 검색"
              className="min-w-56 flex-1 rounded-md border px-3 py-2 text-sm"
            />
            <input type="hidden" name="role" value={roleFilter} />
            <button type="submit" className={buttonVariants({ size: "sm" })}>
              검색
            </button>
            {q && (
              <Link
                href={{
                  pathname: "/admin/members",
                  query: roleFilter !== "ALL" ? { role: roleFilter } : {},
                }}
                className={buttonVariants({ size: "sm", variant: "ghost" })}
              >
                초기화
              </Link>
            )}
          </form>

          <div className="flex flex-wrap gap-2">
            {ROLE_FILTERS.map((f) => {
              const active = roleFilter === f.value;
              return (
                <Link
                  key={f.value}
                  href={{
                    pathname: "/admin/members",
                    query: {
                      ...(f.value !== "ALL" ? { role: f.value } : {}),
                      ...(q ? { q } : {}),
                    },
                  }}
                  className="contents"
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1"
                  >
                    {f.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardHeader>
      </Card>

      {show(Role.STUDENT) && (
        <Card>
          <CardHeader>
            <CardTitle>학생 ({students.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>로그인 ID</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">남은 횟수</TableHead>
                  <TableHead>등록 기간</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-xs">{m.loginId}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="text-right">{m.remainingLessons}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.enrollmentStart && m.enrollmentEnd
                        ? `${formatKstDate(m.enrollmentStart)} ~ ${formatKstDate(m.enrollmentEnd)}`
                        : "무제한"}
                    </TableCell>
                    <TableCell className="text-right">
                      <DetailLink id={m.id} />
                    </TableCell>
                  </TableRow>
                ))}
                {students.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground"
                    >
                      해당하는 학생이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {show(Role.TEACHER) && (
        <Card>
          <CardHeader>
            <CardTitle>선생님 ({teachers.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>로그인 ID</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>가용 요일/시간</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachers.map((m) => {
                  const totalHours = m.availability.reduce(
                    (sum, a) => sum + a.hours.length,
                    0,
                  );
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="font-mono text-xs">{m.loginId}</TableCell>
                      <TableCell>
                        <StatusBadge status={m.status} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.availability.length > 0
                          ? `${m.availability.length}일 · ${totalHours}시간`
                          : "미설정"}
                      </TableCell>
                      <TableCell className="text-right">
                        <DetailLink id={m.id} />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {teachers.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-sm text-muted-foreground"
                    >
                      해당하는 선생님이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {show(Role.ADMIN) && (
        <Card>
          <CardHeader>
            <CardTitle>관리자 ({admins.length}명)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>로그인 ID</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="font-mono text-xs">{m.loginId}</TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <DetailLink id={m.id} />
                    </TableCell>
                  </TableRow>
                ))}
                {admins.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-sm text-muted-foreground"
                    >
                      해당하는 관리자가 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
