import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto('https://www.adiga.kr/ucp/cls/uni/classUnivView.do?menuId=PCCLSINF2000', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // 폼에서 사용 가능한 연도 옵션 확인
  const formInfo = await page.evaluate(() => {
    const syrEl = document.getElementById('searchSyr') as HTMLSelectElement | HTMLInputElement;
    const info: any = { tagName: syrEl?.tagName, type: (syrEl as any)?.type, value: syrEl?.value };
    
    // select인 경우 옵션 목록
    if (syrEl?.tagName === 'SELECT') {
      info.options = Array.from((syrEl as HTMLSelectElement).options).map(o => ({ value: o.value, text: o.text }));
    }
    
    // 폼 전체 필드 확인
    const form = document.getElementById('frm') as HTMLFormElement;
    if (form) {
      const fd = new FormData(form);
      info.formFields = {};
      fd.forEach((v, k) => { info.formFields[k] = v; });
    }
    
    return info;
  });
  
  console.log('=== 폼 정보 ===');
  console.log(JSON.stringify(formInfo, null, 2));

  // 연도별로 AJAX 요청하고 첫 번째 행의 데이터 비교
  for (const year of [2027, 2026, 2025]) {
    const result = await page.evaluate(async (yr: number) => {
      const syrEl = document.getElementById('searchSyr') as HTMLSelectElement | HTMLInputElement;
      if (syrEl) syrEl.value = String(yr);
      
      const cntEl = document.querySelector('.cntPerPage') as HTMLInputElement;
      if (cntEl) cntEl.value = '10000';
      const pageEl = document.querySelector('.currentPage') as HTMLInputElement;
      if (pageEl) pageEl.value = '1';

      const form = document.getElementById('frm') as HTMLFormElement;
      if (!form) return { error: 'no form' };

      const formData = new URLSearchParams(new FormData(form) as any);
      
      // 실제 전송되는 searchSyr 값 확인
      const sentData: Record<string, string> = {};
      formData.forEach((v, k) => { sentData[k] = v; });

      const resp = await fetch('/ucp/cls/uni/classUnivViewAjax.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const html = await resp.text();
      
      // 첫 5행의 raw HTML 추출
      const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
      const rows: string[] = [];
      if (tbodyMatch) {
        const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let m;
        let count = 0;
        while ((m = trPattern.exec(tbodyMatch[1])) && count < 3) {
          const cells: string[] = [];
          const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
          let td;
          while ((td = tdPattern.exec(m[1]))) {
            cells.push(td[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
          }
          rows.push(cells.join(' | '));
          count++;
        }
      }
      
      return { sentSearchSyr: sentData['searchSyr'], totalHtmlLen: html.length, firstRows: rows };
    }, year);
    
    console.log(`\n=== ${year}학년도 ===`);
    console.log(JSON.stringify(result, null, 2));
  }

  await browser.close();
}

main().catch(console.error);
