import { chromium } from 'playwright';

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

  // 서울대 컴공을 비교 대상으로 (데이터가 확실히 있을 학과)
  const targets = ['서울대학교', '연세대학교', '고려대학교'];
  
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

    const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (!tbodyMatch) continue;

    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    console.log(`\n=== ${year}학년도 ===`);
    
    while ((trMatch = trPattern.exec(tbodyMatch[1]))) {
      const cells: string[] = [];
      const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let td;
      while ((td = tdPattern.exec(trMatch[1]))) {
        cells.push(td[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
      }
      const univText = cells[1]?.replace(/\[.*?\]/, '').trim() ?? '';
      const dept = cells[0] ?? '';
      if (targets.some(t => univText.includes(t)) && (dept.includes('경영') || dept.includes('컴퓨터'))) {
        console.log(`  ${univText} | ${dept} | ${cells[3]} | 모집:${cells[4]}`);
      }
    }
  }

  await browser.close();
}
main().catch(console.error);
