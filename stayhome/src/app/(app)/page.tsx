import { PageHeader } from "@/components/page-header";
import { SearchView } from "@/components/search/SearchView";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="객실 조회"
        description="날짜와 지점을 고르면 수집된 잔여 객실을 보여줍니다. 캐시에 없으면 지점을 선택하고 ‘최신화’를 누르세요."
      />
      <SearchView />
    </div>
  );
}
