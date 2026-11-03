import { AppMark } from "@/components/app-mark";
import { CreateEventDialog } from "@/components/home/CreateEventDialog";
import { EventHistory } from "@/components/home/EventHistory";
import { HomeNameGate } from "@/components/home/HomeNameGate";
import { todayKstIso } from "@/lib/dates";
import { listEvents } from "@/lib/events";

/** 히스토리는 DB에서 매 요청 읽는다. */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [events, today] = [await listEvents(), todayKstIso()];

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 pt-8 pb-16">
      <header className="flex items-center gap-3">
        <AppMark className="size-11" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">회식 메뉴 장바구니</h1>
          <p className="text-sm text-muted-foreground">네이버 지도 링크 하나로 팀 메뉴 접수 시작</p>
        </div>
      </header>

      {/* 홈의 주 행동 — 목록 위에 항상 보이는 한 버튼. 폼은 다이얼로그로 연다. */}
      <CreateEventDialog defaultDate={today} size="lg" className="h-11 w-full text-base" />

      <EventHistory initial={events} today={today} />

      <section className="space-y-2 text-sm text-muted-foreground">
        <h2 className="font-medium text-foreground">이렇게 씁니다</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>「새 회식 만들기」에 네이버 지도 「공유」 링크와 날짜·예상 인원을 넣으면 메뉴판이 자동으로 들어옵니다.</li>
          <li>만들어진 링크를 팀 채팅방에 올립니다. 팀원은 이름만 적고 먹고 싶은 메뉴를 수량과 함께 담습니다.</li>
          <li>장바구니 탭에서 메뉴별·사람별 집계와 예상 금액을 봅니다. 지난 회식은 히스토리에 남습니다.</li>
        </ol>
      </section>

      <HomeNameGate />
    </main>
  );
}
