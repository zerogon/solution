import { PageHeader } from "@/components/page-header";
import { PropertyTable } from "@/components/admin/PropertyTable";
import { getPropertyAdminCatalog } from "@/lib/resort-catalog";

/**
 * 지점 제외 관리. 조회 화면(`app/(app)/page.tsx`)이 `getSearchCatalog()`로 읽는 그
 * 목록을 여기서는 **아무것도 숨기지 않고** 보여준다 — 비활성 리조트도, 이미 제외된
 * 지점도 그대로다. `Resort.active`와 제외는 다른 스위치이고, 하나를 다른 하나 뒤에
 * 숨기면 "왜 이 지점이 안 보이지"의 답이 두 화면으로 갈린다.
 */
export default async function AdminPropertiesPage() {
  const catalog = await getPropertyAdminCatalog();

  // 서버 전용 타입을 클라이언트 컴포넌트로 그대로 넘기지 않고 화면이 쓰는 shape으로
  // 옮겨 담는다 (`accounts/page.tsx`의 `safeAccounts`와 같은 판단).
  const resorts = catalog.map((r) => ({
    resortId: r.resortId,
    slug: r.slug as string,
    name: r.name,
    active: r.active,
    properties: r.properties,
    orphanExclusions: r.orphanExclusions,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="지점 관리"
        description="제휴가 없는 지점을 빼면 조회 화면에서 사라지고 정기 수집에서도 제외됩니다. 이미 수집된 재고는 즉시 삭제되며, 되살려도 다음 수집 전까지는 비어 있습니다."
      />
      <PropertyTable resorts={resorts} />
    </div>
  );
}
