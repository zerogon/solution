/**
 * 서울 4년제 실용음악 경쟁률 크롤러
 * 대학어디가(adiga.kr) AJAX API를 활용하여 데이터 수집
 *
 * 실행: pnpm etl:crawl:music
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(process.cwd(), 'data');

// ── 설정 ──

// 실용음악 관련 키워드 (학과명에 하나라도 포함되면 매칭)
const MUSIC_KEYWORDS = [
  '실용음악', '포스트모던', 'PostModern', '현대실용음악',
  'K-POP', '뮤직프로덕션', '싱어송라이팅',
];

// 수집 대상 연도 (학년도 기준)
const TARGET_YEARS = [2027, 2026, 2025];

// ── 타입 정의 ──

interface MusicDepartment {
  departmentName: string;
  universityName: string;
  campus: string;
  region: string;
  unvCd: string;
  ruCd: string;
}

interface CompetitionRateData {
  universityName: string;
  departmentName: string;
  campus: string;
  region: string;
  year: number;
  admissionType: string; // 수시 | 정시
  applicants: number;
  accepted: number;
  rate: number;
}

// ── HTML 파싱 ──

/** AJAX 응답 HTML에서 학과 목록 파싱 */
function parseDepartmentList(html: string): MusicDepartment[] {
  const results: MusicDepartment[] = [];

  const tbodyMatch = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return results;

  const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trPattern.exec(tbodyMatch[1])) !== null) {
    const trContent = trMatch[1];

    // td 추출
    const cells: string[] = [];
    const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdPattern.exec(trContent)) !== null) {
      cells.push(tdMatch[1]);
    }
    if (cells.length < 3) continue;

    // 학과명
    const deptText = cells[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

    // unvCd, ruCd 추출 — onclick 또는 href에서
    const codeMatch = trContent.match(/unvCd[=:]\s*['"]?(\w+)['"]?[\s&,].*?ruCd[=:]\s*['"]?(\w+)['"]?/);
    const unvCd = codeMatch?.[1] ?? '';
    const ruCd = codeMatch?.[2] ?? '';

    // onclick에서도 시도
    let unvCdFinal = unvCd;
    let ruCdFinal = ruCd;
    if (!unvCdFinal) {
      const onclickMatch = trContent.match(/fn\w*\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]/);
      if (onclickMatch) {
        unvCdFinal = onclickMatch[1];
        ruCdFinal = onclickMatch[2];
      }
    }

    // 대학명
    const univRaw = cells[1]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';
    const campusMatch = univRaw.match(/\[([^\]]+)\]/);
    const universityName = univRaw.replace(/\[.*?\]/, '').trim();
    const campus = campusMatch?.[1] ?? '본교';

    // 지역
    const region = cells[2]?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() ?? '';

    results.push({
      departmentName: deptText,
      universityName,
      campus,
      region,
      unvCd: unvCdFinal,
      ruCd: ruCdFinal,
    });
  }

  return results;
}

/** 학과 상세 페이지에서 연도별 경쟁률 차트 데이터 파싱 */
function parseChartData(jsonStr: string): Array<{ year: number; susiRate: number; jeongsiRate: number; susiApplicants: number; jeongsiApplicants: number; susiAccepted: number; jeongsiAccepted: number }> {
  try {
    const data = JSON.parse(jsonStr);
    const chartData = data?.cmmUcpVO?.chartData ?? data?.chartData;
    if (!chartData) return [];

    // chartData가 다양한 형태일 수 있음
    if (Array.isArray(chartData)) {
      return chartData.map((item: any) => ({
        year: parseInt(item.year ?? item.syr ?? '0', 10),
        susiRate: parseFloat(item.susiVal ?? item.val1 ?? '0') || 0,
        jeongsiRate: parseFloat(item.jeongsiVal ?? item.val2 ?? '0') || 0,
        susiApplicants: parseInt(item.susiApplicants ?? '0', 10) || 0,
        jeongsiApplicants: parseInt(item.jeongsiApplicants ?? '0', 10) || 0,
        susiAccepted: parseInt(item.susiAccepted ?? '0', 10) || 0,
        jeongsiAccepted: parseInt(item.jeongsiAccepted ?? '0', 10) || 0,
      }));
    }

    return [];
  } catch {
    return [];
  }
}

// ── 메인 크롤러 ──

async function main() {
  console.log('=== 서울 4년제 실용음악 경쟁률 크롤러 ===\n');
  mkdirSync(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // ── Step 1: 학과정보 페이지 접속 & CSRF ──
  console.log('[1/4] 대학어디가 접속...');
  await page.goto('https://www.adiga.kr/ucp/cls/uni/classUnivView.do?menuId=PCCLSINF2000', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // ── Step 2: 전체 학과 목록에서 실용음악 필터링 ──
  console.log('[2/4] 전체 학과 데이터 수집...');

  // 2027년(최신) 기준 전체 학과 가져오기
  const allDeptHtml = await page.evaluate(async () => {
    // 페이지 크기를 최대로 설정
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
  });

  const allDepts = parseDepartmentList(allDeptHtml);
  console.log(`  전체 학과: ${allDepts.length}개`);

  // 서울 + 실용음악 필터
  const seoulMusicDepts = allDepts.filter((d) => {
    const isSeoul = d.region === '서울';
    const isMusic = MUSIC_KEYWORDS.some((kw) => d.departmentName.includes(kw));
    return isSeoul && isMusic;
  });

  console.log(`  서울 실용음악: ${seoulMusicDepts.length}개`);
  for (const d of seoulMusicDepts) {
    console.log(`    ${d.universityName} | ${d.departmentName} | unvCd=${d.unvCd} ruCd=${d.ruCd}`);
  }

  // ── Step 3: 각 학과 상세 페이지에서 연도별 경쟁률 추출 ──
  console.log('\n[3/4] 학과별 상세 경쟁률 수집...');

  const allRates: CompetitionRateData[] = [];

  for (const dept of seoulMusicDepts) {
    console.log(`\n  ── ${dept.universityName} ${dept.departmentName} ──`);

    if (!dept.unvCd || !dept.ruCd) {
      console.log('    ⚠ unvCd/ruCd 없음 — 목록 경쟁률로 대체');
      // 목록 페이지의 경쟁률 사용 (단일 연도)
      continue;
    }

    // 상세 페이지 접속
    try {
      const detailUrl = `https://www.adiga.kr/ucp/cls/uni/classUnivDetail.do?menuId=PCCLSINF2000&unvCd=${dept.unvCd}&ruCd=${dept.ruCd}&searchSyr=2027`;
      await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 15000 });

      // 페이지에서 경쟁률 텍스트 추출 (테이블이나 차트 영역)
      const rateData = await page.evaluate(() => {
        const text = document.body.innerText;
        const result: Array<{ label: string; value: string }> = [];

        // "경쟁률" 관련 테이블 데이터 추출
        const tables = document.querySelectorAll('table');
        for (const table of tables) {
          const headers = Array.from(table.querySelectorAll('th')).map((th) => th.textContent?.trim() ?? '');
          if (headers.some((h) => h.includes('경쟁률') || h.includes('지원') || h.includes('모집'))) {
            const rows = table.querySelectorAll('tbody tr');
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll('td, th')).map((c) => c.textContent?.trim() ?? '');
              result.push({ label: cells.join(' | '), value: cells.join(',') });
            }
          }
        }

        // 차트 데이터 영역
        const chartAreas = document.querySelectorAll('[class*="chart"], [id*="chart"], .classCon');
        for (const area of chartAreas) {
          const areaText = area.textContent?.trim().slice(0, 300) ?? '';
          if (areaText.includes('경쟁률') || areaText.includes('지원')) {
            result.push({ label: 'chart_area', value: areaText });
          }
        }

        return result;
      });

      console.log(`    상세 페이지 경쟁률 데이터: ${rateData.length}건`);
      for (const rd of rateData.slice(0, 5)) {
        console.log(`      ${rd.label.slice(0, 100)}`);
      }

      // 차트 API 호출 시도 (경쟁률 itemId 탐색)
      for (const itemId of ['157', '46', '27', '129']) {
        const chartResp = await page.evaluate(async (args: { unvCd: string; ruCd: string; itemId: string }) => {
          const params = new URLSearchParams();
          params.append('unvCd', args.unvCd);
          params.append('ruCd', args.ruCd);
          params.append('itemId', args.itemId);

          try {
            const resp = await fetch('/cmm/com/ucp/unvPblntfChartAjax.do', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: params.toString(),
            });
            return resp.text();
          } catch {
            return '';
          }
        }, { unvCd: dept.unvCd, ruCd: dept.ruCd, itemId });

        if (chartResp && chartResp.length > 10) {
          try {
            const json = JSON.parse(chartResp);
            const vo = json?.cmmUcpVO;
            if (vo) {
              // 주요 필드 출력
              const fields = ['itemId', 'val', 'computFrml', 'chartData'];
              const info: Record<string, any> = {};
              for (const f of fields) {
                if (vo[f] !== undefined && vo[f] !== null) info[f] = vo[f];
              }
              // chartData가 있으면 연도별 데이터
              if (vo.chartData || vo.chartList || vo.list) {
                const chartArr = vo.chartData ?? vo.chartList ?? vo.list;
                console.log(`    차트 API itemId=${itemId}: ${JSON.stringify(chartArr).slice(0, 300)}`);
              } else {
                console.log(`    차트 API itemId=${itemId}: val=${vo.val} computFrml=${vo.computFrml?.slice(0, 50)}`);
              }
            }
          } catch {
            console.log(`    차트 API itemId=${itemId}: 파싱 실패 (${chartResp.slice(0, 100)})`);
          }
        }
      }

      // Rate limiting
      await page.waitForTimeout(1500);

    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 60) : String(err);
      console.log(`    상세 페이지 접근 실패: ${msg}`);
    }
  }

  // ── Step 4: 목록 페이지 연도별 경쟁률 수집 (대안) ──
  console.log('\n[4/4] 연도별 목록 경쟁률 수집...');

  // 이전 페이지로 돌아가서 연도별로 데이터 수집
  await page.goto('https://www.adiga.kr/ucp/cls/uni/classUnivView.do?menuId=PCCLSINF2000', {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  for (const year of TARGET_YEARS) {
    console.log(`\n  ── ${year}학년도 ──`);

    const yearHtml = await page.evaluate(async (yr: number) => {
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

    const yearDepts = parseDepartmentList(yearHtml);

    // 서울 실용음악 필터
    const yearMusicDepts = yearDepts.filter((d) => {
      const isSeoul = d.region === '서울';
      const isMusic = MUSIC_KEYWORDS.some((kw) => d.departmentName.includes(kw));
      return isSeoul && isMusic;
    });

    console.log(`  서울 실용음악: ${yearMusicDepts.length}개`);

    // 경쟁률 데이터 추출 (목록 페이지의 수시/정시)
    // 목록 HTML에서 직접 경쟁률 파싱
    const tbodyMatch = yearHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
    if (tbodyMatch) {
      const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch: RegExpExecArray | null;

      while ((trMatch = trPattern.exec(tbodyMatch[1])) !== null) {
        const trContent = trMatch[1];
        const cells: string[] = [];
        const tdPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
        let tdMatch: RegExpExecArray | null;
        while ((tdMatch = tdPattern.exec(trContent)) !== null) {
          cells.push(tdMatch[1]);
        }
        if (cells.length < 5) continue;

        const deptText = cells[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const isMusic = MUSIC_KEYWORDS.some((kw) => deptText.includes(kw));
        if (!isMusic) continue;

        const univRaw = cells[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const region = cells[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (region !== '서울') continue;

        const campusMatch = univRaw.match(/\[([^\]]+)\]/);
        const universityName = univRaw.replace(/\[.*?\]/, '').trim();
        const campus = campusMatch?.[1] ?? '본교';

        // 경쟁률 파싱 — 수시/정시 숫자 추출
        const rateRaw = cells[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const numbers = rateRaw.match(/[\d.]+/g) ?? [];
        const susiRate = parseFloat(numbers[0] ?? '0') || 0;
        const jeongsiRate = parseFloat(numbers[1] ?? '0') || 0;

        // 모집인원
        const capacityRaw = cells[4].replace(/<[^>]+>/g, '').replace(/,/g, '').trim();
        const capacity = parseInt(capacityRaw, 10) || 0;

        // 수시 데이터
        if (susiRate > 0) {
          allRates.push({
            universityName,
            departmentName: deptText,
            campus,
            region,
            year,
            admissionType: '수시',
            applicants: Math.round(susiRate * capacity) || Math.round(susiRate), // 경쟁률 * 모집인원 = 지원자수 (근사)
            accepted: capacity || 1,
            rate: susiRate,
          });
        }

        // 정시 데이터
        if (jeongsiRate > 0) {
          allRates.push({
            universityName,
            departmentName: deptText,
            campus,
            region,
            year,
            admissionType: '정시',
            applicants: Math.round(jeongsiRate * capacity) || Math.round(jeongsiRate),
            accepted: capacity || 1,
            rate: jeongsiRate,
          });
        }

        console.log(`    ${universityName} | ${deptText} | 수시:${susiRate} 정시:${jeongsiRate} | 모집:${capacity}`);
      }
    }

    await page.waitForTimeout(2000);
  }

  await browser.close();

  // ── 결과 저장 ──
  console.log('\n' + '═'.repeat(60));
  console.log(`총 ${allRates.length}건 수집`);
  console.log('═'.repeat(60));

  // 중복 제거 (동일 대학+학과+연도+전형)
  const uniqueKey = (r: CompetitionRateData) =>
    `${r.universityName}::${r.departmentName}::${r.year}::${r.admissionType}`;
  const seen = new Set<string>();
  const deduped = allRates.filter((r) => {
    const key = uniqueKey(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`중복 제거 후: ${deduped.length}건\n`);

  // 대학별 요약
  const byUniv = new Map<string, CompetitionRateData[]>();
  for (const r of deduped) {
    const key = r.universityName;
    if (!byUniv.has(key)) byUniv.set(key, []);
    byUniv.get(key)!.push(r);
  }

  for (const [univ, rates] of byUniv) {
    console.log(`\n  ${univ}:`);
    for (const r of rates.sort((a, b) => a.year - b.year || a.admissionType.localeCompare(b.admissionType))) {
      console.log(`    ${r.year} ${r.admissionType} | ${r.departmentName} | 경쟁률:${r.rate} 지원:${r.applicants} 모집:${r.accepted}`);
    }
  }

  // JSON 저장
  const resultPath = join(DATA_DIR, 'crawled-music-rates.json');
  writeFileSync(resultPath, JSON.stringify(deduped, null, 2), 'utf-8');
  console.log(`\n결과 저장: ${resultPath}`);
}

main().catch((err) => {
  console.error('크롤링 실패:', err);
  process.exit(1);
});
