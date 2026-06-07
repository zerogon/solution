import { Megaphone } from "lucide-react";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AnnouncementList } from "@/components/announcements/AnnouncementList";
import { listPublishedAnnouncements } from "@/lib/announcements";

export default async function TeacherAnnouncements() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const rows = await listPublishedAnnouncements(session.user.id);
  const items = rows.map((a) => ({
    id: a.id,
    title: a.title,
    content: a.content,
    isPinned: a.isPinned,
    publishedAt: a.publishedAt,
    createdAt: a.createdAt,
    unread: a.reads.length === 0,
  }));

  return (
    <div className="space-y-5">
      <PageHeader title="공지사항" description={`전체 ${items.length}건`} />
      {items.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Megaphone}
              title="등록된 공지사항이 없습니다"
              description="새로운 공지가 등록되면 여기에 표시됩니다."
            />
          </CardContent>
        </Card>
      ) : (
        <AnnouncementList items={items} basePath="/teacher/announcements" />
      )}
    </div>
  );
}
