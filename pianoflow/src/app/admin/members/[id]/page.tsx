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
import { MemberActions } from "./_MemberActions";
import { TeacherCredentials } from "./_TeacherCredentials";

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
            <Badge variant={member.status === UserStatus.ACTIVE ? "secondary" : "outline"}>
              {member.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <MemberActions
            id={member.id}
            role={member.role}
            status={member.status}
            remainingLessons={member.remainingLessons}
            enrollmentStart={
              member.enrollmentStart ? formatKstDate(member.enrollmentStart) : null
            }
            enrollmentEnd={
              member.enrollmentEnd ? formatKstDate(member.enrollmentEnd) : null
            }
          />
        </CardContent>
      </Card>

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

      {member.role === Role.STUDENT && (
        <Card>
          <CardHeader>
            <CardTitle>크레딧 로그</CardTitle>
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
