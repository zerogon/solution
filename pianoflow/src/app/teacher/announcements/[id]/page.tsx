import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AnnouncementDetail } from "@/components/announcements/AnnouncementDetail";
import { MarkAnnouncementRead } from "@/components/announcements/MarkAnnouncementRead";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TeacherAnnouncementDetail({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: { reads: { where: { userId: session.user.id }, select: { id: true } } },
  });
  if (!announcement || !announcement.isPublished) notFound();

  return (
    <>
      <MarkAnnouncementRead
        announcementId={announcement.id}
        unread={announcement.reads.length === 0}
      />
      <AnnouncementDetail
        announcement={announcement}
        basePath="/teacher/announcements"
      />
    </>
  );
}
