import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatKstDate, parseKstDate } from "@/lib/slots";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

export default async function AdminHome() {
  const todayStr = formatKstDate(new Date());
  const todayStart = parseKstDate(todayStr);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [activeMembers, todayReservations, lowCredit] = await Promise.all([
    prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
    prisma.reservation.count({
      where: {
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.user.count({
      where: {
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
        remainingLessons: { lt: 2 },
      },
    }),
  ]);

  const stats = [
    { label: "활성 회원", value: activeMembers, suffix: "명" },
    { label: "오늘 예약", value: todayReservations, suffix: "건" },
    { label: "크레딧 부족 학생", value: lowCredit, suffix: "명" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {s.value}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {s.suffix}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
