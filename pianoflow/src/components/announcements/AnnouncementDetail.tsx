import Link from "next/link";
import { ArrowLeft, Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatKstDate } from "@/lib/slots";

function dateLabel(d: Date) {
  return formatKstDate(d).replace(/-/g, ".");
}

/** 학생·선생님 공통 공지 상세. 긴 본문 대응(whitespace-pre-wrap). */
export function AnnouncementDetail({
  announcement,
  basePath,
}: {
  announcement: {
    title: string;
    content: string;
    isPinned: boolean;
    publishedAt: Date | null;
    createdAt: Date;
  };
  basePath: string;
}) {
  return (
    <div className="space-y-4">
      <Link
        href={basePath}
        className={buttonVariants({ size: "sm", variant: "ghost" })}
      >
        <ArrowLeft className="size-4" />
        목록으로
      </Link>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {announcement.title}
            </h1>
            {announcement.isPinned && (
              <Badge variant="secondary" className="shrink-0">
                <Pin aria-hidden className="size-3" />
                중요
              </Badge>
            )}
          </div>
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {dateLabel(announcement.publishedAt ?? announcement.createdAt)}
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground">
            {announcement.content}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
