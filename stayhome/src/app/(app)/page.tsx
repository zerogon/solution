import { PageHeader } from "@/components/page-header";
import { SearchView } from "@/components/search/SearchView";
import { getSearchCatalog } from "@/lib/resort-catalog";

export default async function HomePage() {
  // 서버에서 카탈로그를 읽어 내려보낸다. 크롤러 config를 클라이언트가 직접 import하면
  // bizCd·로그인 셀렉터까지 브라우저 번들에 실린다 (`lib/resort-catalog.ts` 주석 참조).
  const catalog = await getSearchCatalog();

  return (
    <div className="space-y-6">
      <PageHeader
        title="객실 조회"
        description="장소와 날짜를 고르면 수집된 잔여 객실을 보여줍니다. 캐시에 없으면 지점을 선택하고 ‘최신화’를 누르세요."
      />
      <SearchView catalog={catalog} />
    </div>
  );
}
