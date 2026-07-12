import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { formatKstDate } from "@/lib/slots";
import { reservedFutureCount } from "@/lib/credits";
import { MemberStatusBadge } from "@/components/member-status-badge";
import { MemberActions } from "./_MemberActions";
import { AdminCredentials } from "./_AdminCredentials";
import { TeacherCredentials } from "./_TeacherCredentials";
import { SpecialtyEditor } from "./_SpecialtyEditor";
import { RecurringSection } from "./_RecurringSection";

interface PageProps {
  params: Promise<{ id: string }>;
}

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "관리자",
  TEACHER: "선생님",
  STUDENT: "학생",
};

export default async function MemberDetail({ params }: PageProps) {
  const { id } = await params;
  const member = await prisma.user.findUnique({
    where: { id },
    include: {
      availability: true,
      creditLogs: {
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { actor: true },
      },
    },
  });
  if (!member) notFound();

  const reservedFuture =
    member.role === Role.STUDENT ? await reservedFutureCount(member.id) : 0;

  let recurringCard: React.ReactNode = null;
  if (member.role === Role.STUDENT) {
    const [teachers, templates] = await Promise.all([
      prisma.user.findMany({
        where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
        include: { availability: true },
        orderBy: { name: "asc" },
      }),
      prisma.recurringReservation.findMany({
        where: { studentId: member.id },
        include: { teacher: { select: { name: true } } },
        orderBy: [{ active: "desc" }, { weekday: "asc" }, { hour: "asc" }],
      }),
    ]);
    recurringCard = (
      <Card>
        <CardHeader>
          <CardTitle>고정 예약</CardTitle>
        </CardHeader>
        <CardContent>
          <RecurringSection
            studentId={member.id}
            teachers={teachers.map((t) => ({
              id: t.id,
              name: t.name,
              availability: t.availability.map((a) => ({
                weekday: a.weekday,
                hours: a.hours,
              })),
            }))}
            templates={templates.map((t) => ({
              id: t.id,
              teacherName: t.teacher.name,
              weekday: t.weekday,
              hour: t.hour,
              active: t.active,
            }))}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{member.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{member.loginId} · {member.phone}</p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{ROLE_LABEL[member.role]}</Badge>
            <MemberStatusBadge status={member.status} />
          </div>
        </CardHeader>
        <CardContent>
          {member.role === Role.ADMIN ? (
            <AdminCredentials id={member.id} currentLoginId={member.loginId} />
          ) : (
            <MemberActions
              id={member.id}
              role={member.role}
              status={member.status}
              remainingLessons={member.remainingLessons}
              reservedFuture={reservedFuture}
              note={member.note}
              enrollmentStart={
                member.enrollmentStart ? formatKstDate(member.enrollmentStart) : null
              }
              enrollmentEnd={
                member.enrollmentEnd ? formatKstDate(member.enrollmentEnd) : null
              }
            />
          )}
        </CardContent>
      </Card>

      {member.role === Role.TEACHER && (
        <Card>
          <CardHeader>
            <CardTitle>전공</CardTitle>
          </CardHeader>
          <CardContent>
            <SpecialtyEditor
              teacherId={member.id}
              current={member.specialties}
            />
          </CardContent>
        </Card>
      )}

      {member.role === Role.TEACHER && (
        <Card>
          <CardHeader>
            <CardTitle>로그인 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <TeacherCredentials
              teacherId={member.id}
              currentLoginId={member.loginId}
            />
          </CardContent>
        </Card>
      )}

      {member.role === Role.TEACHER && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>가용 요일/시간</CardTitle>
            <Link
              href={`/admin/teachers/${member.id}/availability`}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              편집
            </Link>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {member.availability.length === 0 ? (
                <span className="text-sm text-muted-foreground">설정된 요일이 없습니다.</span>
              ) : (
                member.availability.map((a) => (
                  <Badge key={a.id} variant="secondary">
                    {a.weekday} ({a.hours.length}시간)
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {recurringCard}

      {member.role === Role.STUDENT && (
        <Card>
          <CardHeader>
            <CardTitle>레슨 로그</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {member.creditLogs.length === 0 ? (
              <p className="text-muted-foreground">로그가 없습니다.</p>
            ) : (
              member.creditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between border-b py-1 last:border-b-0"
                >
                  <span>
                    {log.delta > 0 ? "+" : ""}
                    {log.delta} · {log.reason}
                    {log.memo ? ` · ${log.memo}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {log.actor?.name ?? "-"} ·{" "}
                    {log.createdAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
