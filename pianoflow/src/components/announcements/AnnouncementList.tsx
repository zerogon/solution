import Link from "next/link";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatKstDate } from "@/lib/slots";

export type AnnouncementListItem = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  unread: boolean;
};

function dateLabel(d: Date) {
  return formatKstDate(d).replace(/-/g, ".");
}

/** 학생·선생님 공통 공지 목록. basePath로 상세 경로를 분기한다. */
export function AnnouncementList({
  items,
  basePath,
}: {
  items: AnnouncementListItem[];
  basePath: string;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={`${basePath}/${a.id}`}
            className={cn(
              "block rounded-lg border bg-card p-4 transition-colors hover:border-ring/50 hover:bg-muted/40",
              a.isPinned && "border-primary/30 bg-primary/[0.03]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  {a.isPinned && (
                    <Pin
                      aria-label="중요"
                      className="size-3.5 shrink-0 text-primary"
                    />
                  )}
                  <h2 className="truncate font-medium">{a.title}</h2>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {a.content}
                </p>
              </div>
              {a.unread && (
                <Badge variant="destructive" className="shrink-0">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-destructive"
                  />
                  새 공지
                </Badge>
              )}
            </div>
            <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              {dateLabel(a.publishedAt ?? a.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
