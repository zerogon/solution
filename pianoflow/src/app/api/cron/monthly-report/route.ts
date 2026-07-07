import { NextResponse } from "next/server";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { formatKstDate } from "@/lib/slots";

// 매월 1일 Vercel Cron이 호출하는 학생 현황 CSV 리포트 발송 엔드포인트.
// 세션이 아닌 CRON_SECRET Bearer 토큰으로 인증한다 (Vercel Cron이 자동 첨부).

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.REPORT_EMAIL_TO;
  if (!apiKey || !to) {
    return NextResponse.json(
      { error: "RESEND_API_KEY / REPORT_EMAIL_TO 환경변수가 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const students = await prisma.user.findMany({
    where: { role: Role.STUDENT, status: { not: UserStatus.WITHDRAWN } },
    orderBy: { name: "asc" },
  });

  const header = ["이름", "등록일", "마감일", "남은 레슨 수", "연락처"];
  const rows = students.map((s) => [
    s.name,
    s.enrollmentStart ? formatKstDate(s.enrollmentStart) : "",
    s.enrollmentEnd ? formatKstDate(s.enrollmentEnd) : "",
    String(s.remainingLessons),
    s.phone,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map(csvField).join(","))
    .join("\r\n");

  const kstMonth = formatKstDate(new Date()).slice(0, 7); // YYYY-MM
  const [year, month] = kstMonth.split("-");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "PianoFlow <onboarding@resend.dev>",
    to,
    subject: `[PianoFlow] ${year}년 ${Number(month)}월 학생 현황 (${students.length}명)`,
    text: `${year}년 ${Number(month)}월 기준 학생 현황 리포트입니다.\n\n재원 학생 ${students.length}명의 이름·등록일·마감일·남은 레슨 수·연락처가 첨부된 CSV 파일에 담겨 있습니다.`,
    attachments: [
      {
        filename: `students-${kstMonth}.csv`,
        // UTF-8 BOM: Excel에서 한글 깨짐 방지
        content: Buffer.from("\uFEFF" + csv, "utf-8"),
      },
    ],
  });

  if (error) {
    return NextResponse.json(
      { error: `메일 발송 실패: ${error.message}`, students: students.length },
      { status: 500 },
    );
  }

  return NextResponse.json({ sent: true, students: students.length, to });
}
