import { PageHeader } from "@/components/page-header";
import { RoomRateTable } from "@/components/admin/RoomRateTable";
import { getRoomRateAdminCatalog } from "@/lib/resort-catalog";

/**
 * 수동 요금 관리.
 *
 * 다섯 리조트 중 요금이 자동으로 붙는 곳은 롯데·오크밸리(정기)와 리솜(최신화 시)뿐이고,
 * 소노·한화는 사이트가 금액을 아예 주지 않는다. 그 빈칸을 운영자가 조회 화면에서
 * 채우면 여기에 모인다.
 *
 * **이 화면은 요금을 만들지 않는다** — 목록·확인·삭제만 한다. 생성과 수정이 조회 화면에만
 * 있는 이유는 `roomType`에 대조할 카탈로그가 없기 때문이다(사이트가 정하고 한화만 107종).
 * 실제 조회 행에서만 입력을 열면 그 값을 사람이 타이핑할 일이 없다.
 */
export default async function AdminRatesPage() {
  const catalog = await getRoomRateAdminCatalog();

  // 서버 전용 타입을 클라이언트 컴포넌트로 그대로 넘기지 않고 화면이 쓰는 shape으로
  // 옮겨 담는다 (`admin/properties/page.tsx`와 같은 판단).
  const resorts = catalog.map((r) => ({
    resortId: r.resortId,
    slug: r.slug as string,
    name: r.name,
    active: r.active,
    rates: r.rates,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="수동 요금"
        description="사이트가 요금을 주지 않는 객실에 직접 넣은 1박 단가입니다. 조회 화면은 단가에 조회한 박수를 곱해 ‘수동 입력’으로 표시합니다. 새 요금은 조회 결과의 객실 행에서 넣으세요."
      />
      <RoomRateTable resorts={resorts} />
    </div>
  );
}
