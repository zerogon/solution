/**
 * 대학알리미(academyinfo.go.kr) 연도별 경쟁률 크롤러
 * Strategy A: Excel 일괄 다운로드 (UI 조작 방식)
 * Strategy B: 개별 대학 AJAX 인터셉트 (폴백)
 *
 * 실행: pnpm etl:crawl:academyinfo
 */

import { chromium, Page } from 'playwright';
import { writeFileSync, mkdirSync, unlinkSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { inferUniversityType } from './normalizer';

const DATA_DIR = join(process.cwd(), 'data');
const DOWNLOAD_DIR = join(DATA_DIR, 'downloads');
const BASE_URL = 'https://www.academyinfo.go.kr';

// 실용음악 관련 키워드
const MUSIC_KEYWORDS = [
  '실용음악', '포스트모던', 'PostModern', '현대실용음악',
  'K-POP', '뮤직프로덕션', '싱어송라이팅',
];

// ── 타입 정의 ──

interface CompetitionRateData {
  universityName: string;
  departmentName: string;
  campus: string;
  region: string;
  year: number;
  admissionType: string;
  applicants: number;
  accepted: number;
  rate: number;
  universityType: string;
}

// ── 유틸리티 ──

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMusicDepartment(deptName: string): boolean {
  return MUSIC_KEYWORDS.some((kw) => deptName.includes(kw));
}

function parseNumber(val: any): number {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/,/g, '').replace(/\s/g, '').trim();
  return parseFloat(cleaned) || 0;
}

// ── Strategy A: Excel 다운로드 (UI 조작) ──

async function strategyExcelDownload(page: Page): Promise<CompetitionRateData[]> {
  console.log('\n[Strategy A] Excel 다운로드 방식 시도...');
  mkdirSync(DOWNLOAD_DIR, { recursive: true });

  // 1. 다운로드 페이지 접속
  console.log('  [1/5] 다운로드 페이지 접속...');
  await page.goto(`${BASE_URL}/popup/main0810/list.do`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // 페이지 로딩 대기 (RealGrid 초기화)
  await delay(3000);

  // 2. "대학" 선택 확인 (기본값)
  console.log('  [2/5] 공시항목 목록 로딩 대기...');
  // RealGrid가 데이터를 로딩할 때까지 대기
  await page.waitForFunction(() => {
    return typeof (window as any).dataProvider !== 'undefined' &&
           (window as any).dataProvider !== null;
  }, { timeout: 10000 }).catch(() => {
    console.log('    RealGrid 로딩 대기 타임아웃 — 계속 진행');
  });

  // 3. RealGrid에서 "입학전형 유형별 선발 결과" 항목의 연도 체크박스 조작
  console.log('  [3/5] 입학전형 항목 찾기 및 연도 선택...');

  // RealGrid 데이터에서 항목 탐색
  const gridData = await page.evaluate(() => {
    const dp = (window as any).dataProvider;
    if (!dp) return { error: 'dataProvider not found' };

    const rowCount = dp.getRowCount();
    const rows: any[] = [];
    for (let i = 0; i < rowCount; i++) {
      const row = dp.getJsonRow(i);
      rows.push(row);
    }
    return { rowCount, rows };
  });

  if ('error' in gridData) {
    console.log(`    ${gridData.error}`);
    return [];
  }

  console.log(`    RealGrid 행 수: ${gridData.rowCount}`);

  // "입학전형 유형별 선발 결과" 행 찾기
  let targetRowIdx = -1;
  for (let i = 0; i < gridData.rows.length; i++) {
    const row = gridData.rows[i];
    const allFields = Object.values(row).map((v) => String(v ?? ''));
    const combined = allFields.join(' ');
    if (combined.includes('입학전형') && combined.includes('선발')) {
      targetRowIdx = i;
      console.log(`    대상 행 발견: idx=${i}`);
      console.log(`    행 데이터: ${JSON.stringify(row)}`);
      break;
    }
  }

  if (targetRowIdx === -1) {
    console.log('    입학전형 항목을 찾지 못함');
    // 모든 행 출력
    for (let i = 0; i < Math.min(gridData.rows.length, 30); i++) {
      const row = gridData.rows[i];
      const name = row.field3 ?? row.field2 ?? row.field1 ?? '';
      console.log(`      [${i}] ${name}`);
    }
    return [];
  }

  // 출력구분 확인 (field51=배열, field52=개수, field53=코드)
  const targetRow = gridData.rows[targetRowIdx];
  console.log(`    출력구분: field51=${targetRow.field51}, field52=${targetRow.field52}, field53=${targetRow.field53}`);
  console.log(`    연도 체크: field6=${targetRow.field6}(${targetRow.field61}), field7=${targetRow.field7}(${targetRow.field71}), field8=${targetRow.field8}(${targetRow.field81})`);

  // 모든 연도 체크박스를 활성화하고 선택 그리드(grid2)에 추가
  const addResult = await page.evaluate((args: { rowIdx: number }) => {
    const dp = (window as any).dataProvider;
    const gv = (window as any).gridView;
    const dp2 = (window as any).dataProvider2;

    if (!dp || !gv || !dp2) return { error: 'Grid objects not found' };

    const row = dp.getJsonRow(args.rowIdx);

    // 연도별 체크박스 활성화 (field6, field7, field8 = 1/0)
    // 각 연도에 대해 grid2에 행 추가
    const years: string[] = [];
    const results: any[] = [];

    // field6=1번 연도, field7=2번 연도, field8=3번 연도
    const yearFields = [
      { checkField: 'field6', labelField: 'field61' },
      { checkField: 'field7', labelField: 'field71' },
      { checkField: 'field8', labelField: 'field81' },
    ];

    for (const yf of yearFields) {
      const yearLabel = row[yf.labelField];
      if (!yearLabel) continue;
      years.push(yearLabel);

      // 체크 활성화
      dp.setValue(args.rowIdx, yf.checkField, '1');

      // grid2에 행 추가 (선택 항목 그리드)
      const newRow: any = {
        field1: row.field1,   // 카테고리
        field2: row.field2,   // 공시항목1
        field3: row.field3,   // 공시항목2
        field4: row.field4,
        field5: row.field5 ?? '', // 출력구분
        field53: row.field53 ?? '',  // 출력구분코드 (예: 25^^10)
        field54: yearLabel,   // 연도 (예: 2025)
        field6: '1',
        field11: row.field11 ?? row.item_id ?? '', // item_id
      };

      dp2.addRow(newRow);
      results.push({ year: yearLabel, code: row.field53 });
    }

    return { years, results, grid2Count: dp2.getRowCount() };
  }, { rowIdx: targetRowIdx });

  console.log(`    선택 결과: ${JSON.stringify(addResult)}`);

  if ('error' in addResult || addResult.grid2Count === 0) {
    console.log('    그리드 항목 추가 실패');
    return [];
  }

  // 4. UI 조작으로 항목 추가 및 다운로드
  console.log('  [4/5] UI 조작으로 연도별 항목 추가...');

  // 입학전형 행의 연도 체크박스 클릭 — RealGrid의 체크박스 셀 클릭
  const gv = 'gridView';
  // field6=2023년, field7=2024년, field8=2025년 체크박스
  for (const [fieldIdx, yearLabel] of [['field6', '2023'], ['field7', '2024'], ['field8', '2025']] as const) {
    console.log(`    ${yearLabel}년 체크박스 클릭...`);
    await page.evaluate((args: { rowIdx: number; fieldName: string }) => {
      const dp = (window as any).dataProvider;
      const gv = (window as any).gridView;
      dp.setValue(args.rowIdx, args.fieldName, '1');
      gv.commit();
    }, { rowIdx: targetRowIdx, fieldName: fieldIdx });
    await delay(500);
  }

  // [추가] 버튼 클릭 — 선택한 항목을 grid2로 이동
  // RealGrid의 "추가" 셀(field9)은 클릭 시 fn_dashMap을 호출
  // 직접 fn_dashMap 호출
  const dashResult = await page.evaluate((args: { rowIdx: number }) => {
    const dp = (window as any).dataProvider;
    const row = dp.getJsonRow(args.rowIdx);

    // fn_dashMap(item_id, action, code) 호출
    const fn = (window as any).fn_dashMap;
    if (!fn) return { error: 'fn_dashMap not found' };

    // 각 연도별로 추가
    const results: string[] = [];
    const yearFields = [
      { check: 'field6', label: 'field61' },
      { check: 'field7', label: 'field71' },
      { check: 'field8', label: 'field81' },
    ];

    for (const yf of yearFields) {
      if (row[yf.check] === '1' || row[yf.check] === 1) {
        const yearLabel = row[yf.label];
        const code = row.field53; // 출력코드 (25^^10)
        // fn_dashMap(item_id, "add", code)
        try {
          fn(row.field11 ?? row.item_id, 'add', `${code}^^${yearLabel}`);
          results.push(`${yearLabel}: added`);
        } catch (e: any) {
          results.push(`${yearLabel}: ${e.message}`);
        }
      }
    }

    // grid2 확인
    const dp2 = (window as any).dataProvider2;
    const grid2Count = dp2 ? dp2.getRowCount() : 0;
    const grid2Rows: any[] = [];
    if (dp2) {
      for (let i = 0; i < grid2Count; i++) {
        grid2Rows.push(dp2.getJsonRow(i));
      }
    }

    return { results, grid2Count, grid2Rows };
  }, { rowIdx: targetRowIdx });

  console.log(`    추가 결과: ${JSON.stringify(dashResult)}`);

  // grid2에 데이터가 없으면, 다른 방식으로 시도
  if (dashResult.grid2Count === 0 || 'error' in dashResult) {
    console.log('    fn_dashMap 실패, 직접 grid2에 행 추가...');

    // 직접 RealGrid 클릭으로 체크박스 토글
    // targetRow의 연도 체크박스 셀을 클릭
    for (const colName of ['col6', 'col7', 'col8']) {
      try {
        await page.evaluate((args: { rowIdx: number; colName: string }) => {
          const gv = (window as any).gridView;
          // 셀 클릭 시뮬레이션
          gv.setCurrent({ itemIndex: args.rowIdx, column: args.colName });
          gv.setCheckBar({ exclusive: false });
        }, { rowIdx: targetRowIdx, colName });
        await delay(300);
      } catch { /* ignore */ }
    }

    // [추가] 셀 클릭
    try {
      await page.evaluate((args: { rowIdx: number }) => {
        const gv = (window as any).gridView;
        gv.setCurrent({ itemIndex: args.rowIdx, column: 'col9' });
        // 셀의 onclick 이벤트 발생
        const cellEl = document.querySelector(`[data-column="col9"][data-row="${args.rowIdx}"]`);
        if (cellEl) (cellEl as HTMLElement).click();
      }, { rowIdx: targetRowIdx });
    } catch { /* ignore */ }

    await delay(1000);
  }

  // 사용자 정보 입력
  await page.evaluate(() => {
    const radios = document.querySelectorAll('input[name="dwldUsrDivCd"]');
    radios.forEach((r: any) => { r.checked = r.value === '004'; });
    const purposeRadios = document.querySelectorAll('input[name="dwldPrpsCd"]');
    purposeRadios.forEach((r: any) => { r.checked = r.value === '001'; });
    const dtlCtnt = document.getElementById('dwldDtlCtnt') as HTMLTextAreaElement;
    if (dtlCtnt) dtlCtnt.value = '입시 경쟁률 분석';
  });

  // 네트워크 캡처 활성화
  const capturedReqs: Array<{ url: string; body: string; responsePreview: string }> = [];
  page.on('request', (req) => {
    if (req.url().includes('selectReqList') || req.url().includes('selectReqRst') || req.url().includes('download')) {
      capturedReqs.push({ url: req.url(), body: req.postData() ?? '', responsePreview: '' });
    }
  });

  // 다운로드 버튼 클릭 시도
  console.log('  [5/5] 다운로드 버튼 클릭...');
  const downloadBtn = await page.$('#btnDown, button:has-text("다운로드"), .btn_down, [onclick*="download"]');
  if (downloadBtn) {
    console.log('    다운로드 버튼 발견, 클릭...');

    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        downloadBtn.click(),
      ]);

      const downloadPath = join(DOWNLOAD_DIR, 'academyinfo-admission.xlsx');
      await download.saveAs(downloadPath);
      console.log(`    다운로드 완료: ${downloadPath}`);

      const rates = parseExcelFile(downloadPath);
      console.log(`    파싱 완료: ${rates.length}건`);
      return rates;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.log(`    다운로드 실패: ${msg}`);
    }
  } else {
    console.log('    다운로드 버튼 없음');
  }

  // 캡처된 요청 출력
  if (capturedReqs.length > 0) {
    console.log(`\n    캡처된 요청 (${capturedReqs.length}개):`);
    for (const r of capturedReqs) {
      console.log(`      ${r.url}: body=${r.body.slice(0, 200)}`);
    }
  }

  // selectReqRst 직접 호출 — 파일 생성
  console.log('\n    selectReqRst 직접 호출...');
  const rstResult = await page.evaluate(async () => {
    const dp2 = (window as any).dataProvider2;
    const count = dp2 ? dp2.getRowCount() : 0;

    // sn 파라미터 빌드: field53(출력코드)^^field54(년도) 형식
    let snParam = '';
    for (let i = 0; i < count; i++) {
      const f53 = dp2.getValue(i, 'field53'); // 출력코드 (25^^10)
      const f54 = dp2.getValue(i, 'field54'); // 년도 (2023)
      // sn 파라미터: itemId^^kndCd^^year
      snParam += `&sn=${f53}^^${f54}`;
    }

    // selectReqRst 직접 호출
    const body = `schlDivCd=02&itemDivCd=01&svyYr=&all=02&fp=&fn=` + snParam +
      `&dwldUsrDivCd=004&dwldPrpsCd=001&dwldDtlCtnt=분석`;

    const resp = await fetch('/popup/main0810/selectReqRst.do', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await resp.json();

    return {
      body: body.slice(0, 300),
      response: JSON.stringify(data).slice(0, 500),
      exist: data.resultList?.exist,
      fp: data.resultList?.fp,
      fn: data.resultList?.fn,
    };
  });

  console.log(`    요청: ${rstResult.body}`);
  console.log(`    응답: ${rstResult.response}`);

  // 파일 생성 폴링 (exist=0이면 아직 생성 중)
  let fileReady = rstResult.exist && parseInt(rstResult.exist);
  let fp = rstResult.fp;
  let fn = rstResult.fn;
  let sn = rstResult.response ? JSON.parse(rstResult.response).resultList?.sn : '';

  if (!fileReady) {
    console.log('    파일 생성 중... 폴링 시작');
    for (let attempt = 0; attempt < 20; attempt++) {
      await delay(5000); // 5초 대기
      console.log(`    폴링 ${attempt + 1}/20...`);

      const pollResult = await page.evaluate(async (args: { fp: string; fn: string; sn: string }) => {
        const body = `schlDivCd=02&itemDivCd=01&svyYr=&all=02&fp=${encodeURIComponent(args.fp)}&fn=${encodeURIComponent(args.fn)}&sn=${encodeURIComponent(args.sn)}&dwldUsrDivCd=004&dwldPrpsCd=001&dwldDtlCtnt=분석`;
        const resp = await fetch('/popup/main0810/selectReqRst.do', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body,
        });
        return resp.json();
      }, { fp: fp ?? '', fn: fn ?? '', sn: sn ?? '' });

      const rl = pollResult.resultList;
      if (rl?.exist && parseInt(rl.exist)) {
        fileReady = true;
        fp = rl.fp;
        fn = rl.fn;
        sn = rl.sn;
        console.log(`    파일 준비 완료! fp=${fp}, fn=${fn}, sn=${sn}`);
        break;
      }
      console.log(`    exist=${rl?.exist ?? 'undefined'}`);
    }
  }

  if (fileReady) {
    console.log('    파일 다운로드 시도...');

    await page.evaluate((args: { fp: string; fn: string; sn: string }) => {
      const fpEl = document.getElementById('fp') as HTMLInputElement;
      const fnEl = document.getElementById('fn') as HTMLInputElement;
      const snEl = document.getElementById('sn') as HTMLInputElement;
      if (fpEl) fpEl.value = args.fp ?? '';
      if (fnEl) fnEl.value = args.fn ?? '';
      if (snEl) snEl.value = args.sn ?? '';
    }, { fp: fp ?? '', fn: fn ?? '', sn: sn ?? '' });

    try {
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120000 }),
        page.evaluate(() => {
          const form = document.getElementById('frm') as HTMLFormElement;
          form.method = 'post';
          form.action = '/popup/main0810/download.do';
          form.submit();
        }),
      ]);

      const downloadPath = join(DOWNLOAD_DIR, 'academyinfo-admission.xlsx');
      await download.saveAs(downloadPath);
      console.log(`    다운로드 완료: ${downloadPath}`);

      const rates = parseExcelFile(downloadPath);
      console.log(`    파싱 완료: ${rates.length}건`);
      return rates;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 100) : String(err);
      console.log(`    다운로드 실패: ${msg}`);
    }
  } else {
    console.log('    파일 생성 타임아웃');
  }

  return [];
}

// ── Excel 파싱 ──

function parseExcelFile(filePath: string): CompetitionRateData[] {
  const workbook = XLSX.readFile(filePath);
  const results: CompetitionRateData[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) continue;

    // 헤더 행에서 컬럼 인덱스 찾기
    const headerRow = rows[0].map((h: any) => String(h ?? '').trim());
    console.log(`    시트 "${sheetName}" 헤더: ${headerRow.join(' | ')}`);

    const colMap: Record<string, number> = {};
    for (let i = 0; i < headerRow.length; i++) {
      const h = headerRow[i];
      if (h.includes('학교') || h.includes('대학')) colMap['univ'] ??= i;
      if (h.includes('학과') || h.includes('모집단위')) colMap['dept'] ??= i;
      if ((h.includes('전형') || h.includes('유형')) && !h.includes('설립')) colMap['type'] ??= i;
      if (h.includes('모집') && (h.includes('인원') || h.includes('정원'))) colMap['accepted'] ??= i;
      if (h.includes('지원')) colMap['applicants'] ??= i;
      if (h.includes('경쟁률')) colMap['rate'] ??= i;
      if (h.includes('지역') || h.includes('소재지')) colMap['region'] ??= i;
      if (h.includes('설립')) colMap['univType'] ??= i;
      if (h.includes('연도') || h.includes('년도') || h.includes('공시')) colMap['year'] ??= i;
    }

    console.log(`    컬럼 매핑: ${JSON.stringify(colMap)}`);

    // 데이터 행 파싱
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length < 3) continue;

      const univName = String(row[colMap['univ'] ?? -1] ?? '').trim();
      const deptName = String(row[colMap['dept'] ?? -1] ?? '').trim();
      const admType = String(row[colMap['type'] ?? -1] ?? '').trim();
      const accepted = parseNumber(row[colMap['accepted'] ?? -1]);
      const applicants = parseNumber(row[colMap['applicants'] ?? -1]);
      const rate = parseNumber(row[colMap['rate'] ?? -1]);
      const region = String(row[colMap['region'] ?? -1] ?? '').trim();
      const univType = String(row[colMap['univType'] ?? -1] ?? '').trim();
      const year = colMap['year'] !== undefined ? parseNumber(row[colMap['year']]) : 0;

      if (!univName || rate <= 0) continue;

      results.push({
        universityName: univName,
        departmentName: deptName,
        campus: '본교',
        region: region || '',
        year: year || 2025,
        admissionType: admType || '수시',
        applicants: applicants || Math.round(rate * accepted),
        accepted: accepted || 1,
        rate,
        universityType: univType || inferUniversityType(univName),
      });
    }
  }

  return results;
}

// ── Strategy B: AJAX 인터셉트 (폴백) ──

async function strategyAjaxIntercept(page: Page): Promise<CompetitionRateData[]> {
  console.log('\n[Strategy B] AJAX 인터셉트 방식 시도...');

  // 대학알리미 개별 대학 공시 페이지에서 데이터 추출
  // IPN (공시항목번호) 조회 → 대학별 공시 데이터 접근
  console.log('  메인 페이지 접속...');
  await page.goto(`${BASE_URL}/mainAction.do`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  // IPN 코드 조회 (공시항목 코드 매핑)
  const ipnData = await page.evaluate(async () => {
    try {
      const resp = await fetch('/popup/main0810/selectIPN.do', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: '',
      });
      return await resp.json();
    } catch {
      return null;
    }
  });

  if (ipnData) {
    console.log(`  IPN 데이터 키: ${Object.keys(ipnData).join(', ')}`);
    for (const key of Object.keys(ipnData)) {
      if (Array.isArray(ipnData[key]) && ipnData[key].length > 0) {
        console.log(`    ${key}: ${ipnData[key].length}개`);
        console.log(`    샘플: ${JSON.stringify(ipnData[key][0])}`);
      }
    }
  }

  // main0820 페이지 시도 (학교별 데이터 다운로드)
  console.log('\n  학교별 다운로드 페이지 시도...');
  await page.goto(`${BASE_URL}/popup/main0820/list.do?schlDivCd=02&svyYr=2025`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });

  await delay(3000);

  // 이 페이지의 구조 탐색
  const page0820Info = await page.evaluate(() => {
    const dp = (window as any).dataProvider;
    if (!dp) return { error: 'no dataProvider', bodyPreview: document.body.innerText.slice(0, 500) };

    const rowCount = dp.getRowCount();
    const sampleRows: any[] = [];
    for (let i = 0; i < Math.min(3, rowCount); i++) {
      sampleRows.push(dp.getJsonRow(i));
    }
    return { rowCount, sampleRows };
  });

  console.log(`  학교별 페이지 정보: ${JSON.stringify(page0820Info).slice(0, 500)}`);

  return [];
}

// ── 메인 ──

async function main() {
  console.log('=== 대학알리미 경쟁률 크롤러 ===\n');
  mkdirSync(DATA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  let allRates: CompetitionRateData[] = [];

  // Strategy A 시도
  try {
    allRates = await strategyExcelDownload(page);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`\n[Strategy A 실패] ${msg}`);
  }

  // Strategy A 실패 시 Strategy B
  if (allRates.length === 0) {
    try {
      allRates = await strategyAjaxIntercept(page);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\n[Strategy B 실패] ${msg}`);
    }
  }

  await browser.close();

  // 결과 저장
  if (allRates.length > 0) {
    // 실용음악 필터링
    const musicRates = allRates.filter((r) => isMusicDepartment(r.departmentName));

    // 중복 제거
    const seen = new Set<string>();
    const deduped = musicRates.filter((r) => {
      const key = `${r.universityName}::${r.departmentName}::${r.year}::${r.admissionType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    console.log(`\n총 ${allRates.length}건 수집, 실용음악 ${musicRates.length}건, 중복제거 후 ${deduped.length}건`);

    const resultPath = join(DATA_DIR, 'crawled-academyinfo-music-rates.json');
    writeFileSync(resultPath, JSON.stringify(deduped, null, 2), 'utf-8');
    console.log(`결과 저장: ${resultPath}`);
  } else {
    console.log('\n수집된 데이터 없음 — 사이트 구조 분석 결과를 참고하여 크롤러 고도화 필요');
  }
}

main().catch((err) => {
  console.error('크롤링 실패:', err);
  process.exit(1);
});
