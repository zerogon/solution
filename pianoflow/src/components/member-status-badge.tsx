import { CircleCheck, CirclePause, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "활성",
  DORMANT: "휴면",
  WITHDRAWN: "탈퇴",
};

const STATUS_ICON: Record<UserStatus, typeof CircleCheck> = {
  ACTIVE: CircleCheck,
  DORMANT: CirclePause,
  WITHDRAWN: CircleX,
};

/** 회원 상태(활성/휴면/탈퇴)를 아이콘과 함께 차분하게 표시하는 뱃지 */
export function MemberStatusBadge({ status }: { status: UserStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <Badge variant={status === UserStatus.ACTIVE ? "secondary" : "outline"}>
      <Icon aria-hidden className="size-3" />
      {STATUS_LABEL[status]}
    </Badge>
  );
}
