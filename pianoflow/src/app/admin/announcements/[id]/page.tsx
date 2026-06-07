import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Role, UserStatus } from "@/generated/prisma/enums";
import { formatKstDate } from "@/lib/slots";
import { AnnouncementForm } from "./_AnnouncementForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminAnnouncementDetail({ params }: PageProps) {
  const { id } = await params;

  const [announcement, audience] = await Promise.all([
    prisma.announcement.findUnique({
      where: { id },
      include: { author: { select: { name: true } }, _count: { select: { reads: true } } },
    }),
    prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        role: { in: [Role.STUDENT, Role.TEACHER] },
      },
    }),
  ]);
  if (!announcement) notFound();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>공지 관리</CardTitle>
          <p className="text-sm text-muted-foreground">
            {announcement.author?.name ?? "관리자"} 작성 ·{" "}
            {announcement.isPublished && announcement.publishedAt
              ? `${formatKstDate(announcement.publishedAt).replace(/-/g, ".")} 게시`
              : "미게시"}{" "}
            · 읽음 {announcement._count.reads}/{audience}명
          </p>
        </CardHeader>
        <CardContent>
          <AnnouncementForm
            id={announcement.id}
            initialTitle={announcement.title}
            initialContent={announcement.content}
            initialPublished={announcement.isPublished}
            initialPinned={announcement.isPinned}
          />
        </CardContent>
      </Card>
    </div>
  );
}
