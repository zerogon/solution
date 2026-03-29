import { chromium } from 'playwright';

const MUSIC_KEYWORDS = ['실용음악', '포스트모던', 'PostModern', '현대실용음악', 'K-POP', '뮤직프로덕션', '싱어송라이팅'];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto('https://www.adiga.kr/ucp/cls/uni/classUnivView.do?menuId=PCCLSINF2000', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  for (const year of [2027, 2026, 2025]) {
    const html = await page.evaluate(async (yr: number) => {
      const syrEl = document.getElementById('searchSyr') as HTMLInputElement;
      if (syrEl) syrEl.value = String(yr);
      const cntEl = document.querySelector('.cntPerPage') as HTMLInputElement;
      if (cntEl) cntEl.value = '10000';
      const pageEl = document.querySelector('.currentPage') as HTMLInputElement;
      if (pageEl) pageEl.value = '1';

      const form = document.getElementById('frm') as HTMLFormElement;
      if (!form) return '';
      const formData = new URLSearchParams(new FormData(form) as any).toString();
      const resp = await fetch('/ucp/cls/uni/classUnivViewAjax.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      });
      return resp.text();
    }, year);

    // 실용음악 관련 행만 추출
    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) { console.log(`${year}: no tbody`); continue; }

    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    const musicRows: string[] = [];

    while ((trMatch = trPattern.exec(tbodyMatch[1]))) {
      const cells: string[] = [];
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdPattern.exec(trMatch[1]))) {
        cells.push(td[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      }
      const deptText = cells[0] ?? '';
      if (MUSIC_KEYWORDS.some(kw => deptText.includes(kw))) {
        // cells: [dept, univ, region, rates, capacity, ...]
        musicRows.push(`${cells[1]?.replace(/\[.*?\]/, '').trim()} | ${deptText} | ${cells[3]} | 모집:${cells[4]}`);
      }
    }

    console.log(`\n=== ${year}학년도 (${musicRows.length}건) ===`);
    // 경희대, 서경대 등 주요 대학만 출력
    for (const row of musicRows.filter(r => r.includes('경희') || r.includes('서경') || r.includes('홍익') || r.includes('한양'))) {
      console.log('  ' + row);
    }
  }

  await browser.close();
}
main().catch(console.error);
