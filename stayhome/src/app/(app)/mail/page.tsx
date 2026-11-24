import { PageHeader } from "@/components/page-header";
import { MailView } from "@/components/mail/MailView";

export default function MailPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="예약확정 메일"
        description="리조트 예약 화면의 글자를 복사해 붙여넣으면 예약정보와 취소 마감일이 채워진 안내 메일이 만들어집니다. 캡처는 첨부용으로만 쓰입니다."
      />
      <MailView />
    </div>
  );
}
