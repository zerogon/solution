"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, CloudDownload, Copy, ImagePlus, Loader2, Mail, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import { cn, diffDaysIso } from "@/lib/utils";
import { deadlineIso } from "@/lib/business-days";
import { holidayOracle } from "@/lib/holidays-kr";
import { HOLIDAYS_QUERY_KEY, fetchHolidays } from "@/lib/holidays-client";
import { buildBody, fmtDot, fmtMd, subjectOf, type MailSignature } from "@/lib/mail/body";
import { buildEml, type EmlImage } from "@/lib/mail/eml";
import { parseReservationText } from "@/lib/mail/parse";
import {
  MAIL_RESORTS,
  MAIL_RESORT_KEYS,
  isMailResortKey,
  type MailResortKey,
} from "@/lib/mail/resorts";
import {
  canFetchReservations,
  needsNameToFetch,
  type FetchReservationsResponse,
  type FetchedReservation,
} from "@/lib/mail/reservation";
import { LEAD_DAYS } from "@/components/app-shell/deadline-shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

/**
 * 예약확정 메일 생성기.
 *
 * 값을 채우는 길은 둘이다.
 * 1. **예약 불러오기** — 리조트를 고르면 서버가 그 리조트 예약내역을 실제로 읽어 오고
 *    (`/api/mail/reservations`), 목록에서 사람을 고르면 칸이 채워진다. 지원하는 리조트는
 *    `FETCHABLE_RESORTS`(지금 한화·호반)뿐이다.
 * 2. **붙여넣기** — 리조트 예약 화면을 복사해 붙여넣으면 `parseReservationText`가 칸을
 *    채운다. 불러오기를 지원하지 않는 리조트와, 불러오기가 실패했을 때의 길이다.
 *
 * 캡처 이미지는 **선택**이다. 넣으면 메일에 첨부만 하고 읽지 않는다.
 * 메일(.eml · 본문 복사)은 전부 이 브라우저 안에서 만들어진다. 불러온 예약 목록은 화면
 * 상태로만 들고 있고, 예약자 정보와 캡처는 어디에도 저장하지 않는다.
 */

const FIELD_IDS = [
  "name",
  "resNo",
  "checkin",
  "checkout",
  "price",
  "prepay",
  "region",
  "roomType",
] as const;
type FieldId = (typeof FIELD_IDS)[number];
type Fields = Record<FieldId, string>;
/** auto = 자동으로 채운 칸, miss = 자동으로 채우려 했는데 못 찾은 칸. 사람이 고치면 사라진다. */
type Marks = Partial<Record<FieldId, "auto" | "miss">>;

const EMPTY_FIELDS: Fields = {
  name: "",
  resNo: "",
  checkin: "",
  checkout: "",
  price: "",
  prepay: "",
  region: "",
  roomType: "",
};

const FIELD_LABEL: Record<FieldId, string> = {
  name: "예약자명",
  resNo: "예약번호",
  checkin: "입실일",
  checkout: "퇴실일",
  price: "객실요금",
  prepay: "선결제 기한",
  region: "객실지역",
  roomType: "객실타입",
};

/** 이름·휴대폰·메일은 기본값이 없다 — 개인 정보라 소스에 두지 않는다. */
const DEFAULT_SIGNATURE: MailSignature = {
  name: "",
  team: "사내복지기금운영국",
  orgLine: "사내복지기금운영국, 조직문화그룹, 기업문화실 /  SK쉴더스",
  phone: "",
  address: "서울시 강남구 봉은사로 613 5층",
  email: "",
  website: "www.skshieldus.co.kr",
  slogan: "‘수직보다 수평이 더 넓은 세상을 봅니다’",
};

const SIGNATURE_FIELDS: { id: keyof MailSignature; label: string; placeholder?: string }[] = [
  { id: "name", label: "이름", placeholder: "홍길동" },
  { id: "team", label: "인사말 소속" },
  { id: "orgLine", label: "서명 소속 줄" },
  { id: "phone", label: "휴대폰", placeholder: "010-0000-0000" },
  { id: "email", label: "메일 주소" },
  { id: "address", label: "주소" },
  { id: "website", label: "홈페이지" },
  { id: "slogan", label: "문구" },
];

/** 저장소가 막혀 있어도(시크릿 창 등) 화면은 돌아야 한다. */
const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`stayhome.mail.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(`stayhome.mail.${key}`, value);
      return true;
    } catch {
      return false;
    }
  },
  del(key: string) {
    try {
      localStorage.removeItem(`stayhome.mail.${key}`);
    } catch {
      // 지울 수 없으면 남을 뿐이다.
    }
  },
};

function loadSignature(): MailSignature {
  try {
    const saved = JSON.parse(store.get("signature") ?? "{}") as Partial<MailSignature>;
    return { ...DEFAULT_SIGNATURE, ...saved };
  } catch {
    return DEFAULT_SIGNATURE;
  }
}

function loadFixedImages(): Partial<Record<MailResortKey, string>> {
  const out: Partial<Record<MailResortKey, string>> = {};
  for (const key of MAIL_RESORT_KEYS) {
    const v = store.get(`fixed.${key}`);
    if (v) out[key] = v;
  }
  return out;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

const extOf = (dataUrl: string) => (dataUrl.startsWith("data:image/jpeg") ? "jpg" : "png");

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const MARK_CLASS = {
  auto: "border-emerald-300 bg-emerald-50",
  miss: "border-amber-300 bg-amber-50",
} as const;

export function MailComposer() {
  const [resort, setResort] = useState<MailResortKey>(() => {
    const saved = store.get("lastResort");
    return isMailResortKey(saved) ? saved : "daemyung";
  });
  const [fields, setFields] = useState<Fields>(EMPTY_FIELDS);
  const [marks, setMarks] = useState<Marks>({});
  const [captures, setCaptures] = useState<EmlImage[]>([]);
  const [rawText, setRawText] = useState("");
  const [status, setStatus] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [to, setTo] = useState("");
  const [cancelManual, setCancelManual] = useState("");
  const [signature, setSignature] = useState<MailSignature>(loadSignature);
  const [fixedImages, setFixedImages] = useState(loadFixedImages);
  const [logo, setLogo] = useState<string | null>(() => store.get("logo"));
  const [dragOver, setDragOver] = useState(false);
  /** 불러온 예약 목록. 리조트를 바꾸면 비운다 — 다른 리조트의 목록이 남아 있으면 안 된다. */
  const [fetched, setFetched] = useState<{
    resort: MailResortKey;
    list: FetchedReservation[];
    at: string;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [nameQuery, setNameQuery] = useState("");
  /** 사람 이름이 지정된 예약만 — 법인 명의(이름 null)가 대부분이라 기본으로 숨긴다. */
  const [peopleOnly, setPeopleOnly] = useState(true);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // 처음 열 때 이름이 비어 있으면 서명 칸을 펼쳐 둔다. 값으로 묶으면 이름을 치는 순간 접힌다.
  const [signatureOpen] = useState(() => !signature.name);

  const fileRef = useRef<HTMLInputElement>(null);
  const fixedFileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const cfg = MAIL_RESORTS[resort];
  const fixed = fixedImages[resort] ?? null;

  const holidays = useQuery({
    queryKey: HOLIDAYS_QUERY_KEY,
    queryFn: fetchHolidays,
    staleTime: 12 * 60 * 60_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
  });

  // 취소 마감일 = 입실일의 달력 10일 전, 주말·공휴일이면 직전 영업일 (`business-days.ts`).
  const cancel = useMemo(() => {
    if (!fields.checkin || !holidays.data) return null;
    return deadlineIso(
      fields.checkin,
      LEAD_DAYS,
      holidayOracle(holidays.data.covered, holidays.data.years),
    );
  }, [fields.checkin, holidays.data]);
  /** 공휴일을 판정하지 못해 계산이 서지 않은 상태 — 이때만 직접 입력 칸을 연다. */
  const cancelFailed =
    Boolean(fields.checkin) && (holidays.isError || (cancel !== null && !cancel.ok));
  const cancelIso = cancel?.ok ? cancel.iso : cancelFailed && cancelManual ? cancelManual : null;

  const priceText = useMemo(() => {
    const digits = fields.price.replace(/[^\d]/g, "");
    return digits ? Number(digits).toLocaleString("ko-KR") : "";
  }, [fields.price]);

  const subject = subjectOf(cfg);

  const bodyFor = useCallback(
    (img: { captures: string[]; fixed: string | null; logo: string | null }) =>
      buildBody(
        {
          resort: cfg,
          name: fields.name.trim(),
          resNo: fields.resNo.trim(),
          checkin: fields.checkin,
          checkout: fields.checkout,
          prepay: fields.prepay,
          price: priceText,
          region: fields.region.trim(),
          roomType: fields.roomType.trim(),
          cancelIso,
          signature,
        },
        img,
      ),
    [cfg, fields, priceText, cancelIso, signature],
  );

  const previewHtml = useMemo(
    () => bodyFor({ captures: captures.map((c) => c.dataUrl), fixed, logo }),
    [bodyFor, captures, fixed, logo],
  );

  const pickResort = useCallback((key: MailResortKey) => {
    setResort(key);
    store.set("lastResort", key);
  }, []);

  const canFetch = canFetchReservations(resort);
  /** 롯데처럼 사이트의 이름 검색으로 불러오는 곳 — 이름 칸이 필수이고, 결과를 화면에서 다시 거르지 않는다. */
  const needName = needsNameToFetch(resort);
  const fetchedList = fetched?.resort === resort ? fetched.list : null;
  /** 법인 명의(사용자 미지정) 예약 수 — 체크박스 옆에 "N건 숨김"으로 보인다. */
  const corporateCount = useMemo(
    () => (fetchedList ? fetchedList.filter((r) => !r.name).length : 0),
    [fetchedList],
  );
  const visibleList = useMemo(() => {
    if (!fetchedList) return null;
    const people = peopleOnly ? fetchedList.filter((r) => r.name) : fetchedList;
    const q = nameQuery.replace(/\s+/g, "");
    if (needName || !q) return people;
    return people.filter((r) => (r.name ?? "").replace(/\s+/g, "").includes(q));
  }, [fetchedList, nameQuery, needName, peopleOnly]);

  const loadReservations = useCallback(async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const q = new URLSearchParams({ resort });
      if (needName) q.set("name", nameQuery.trim());
      const res = await fetch(`/api/mail/reservations?${q}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
      const data = body as FetchReservationsResponse;
      setFetched({ resort, list: data.reservations, at: data.fetchedAt });
      setPickedKey(null);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setFetching(false);
    }
  }, [resort, needName, nameQuery]);

  /** 목록에서 고른 예약으로 칸을 **통째로** 채운다 — 고른 한 건이 출처라 이전 값을 남기지 않는다. */
  const applyReservation = useCallback(
    (r: FetchedReservation) => {
      const next: Fields = {
        name: r.name ?? "",
        resNo: r.resNo ?? "",
        checkin: r.checkin,
        checkout: r.checkout,
        price: r.price ? r.price.toLocaleString("ko-KR") : "",
        prepay: "",
        region: r.region ?? "",
        roomType: r.roomType ?? "",
      };
      const wanted = FIELD_IDS.filter((id) => id !== "prepay" || cfg.prepay);
      setFields(next);
      setMarks(Object.fromEntries(wanted.map((id) => [id, next[id] ? "auto" : "miss"])) as Marks);
      setPickedKey(r.key);
      const missing = wanted.filter((id) => !next[id]).map((id) => FIELD_LABEL[id]);
      setStatus(
        missing.length
          ? {
              text: r.name
                ? `채웠습니다. 비어 있는 칸(${missing.join(", ")})은 직접 넣어 주세요.`
                : `채웠습니다. 이 예약은 아직 법인 명의라 예약자명이 없습니다 — 직접 넣어 주세요.${
                    missing.length > 1 ? ` (그 밖에 ${missing.filter((m) => m !== "예약자명").join(", ")})` : ""
                  }`,
              tone: "warn",
            }
          : { text: "예약정보를 모두 채웠습니다.", tone: "ok" },
      );
    },
    [cfg.prepay],
  );

  /** 붙여넣은 글자에서 찾은 값만 덮어쓴다. 못 찾은 칸은 비어 있을 때만 표시한다. */
  const applyText = useCallback(
    (text: string) => {
      const p = parseReservationText(text, resort);
      const target = p.resort ?? resort;
      if (p.resort) pickResort(p.resort);

      const found: Partial<Fields> = {
        name: p.name ?? undefined,
        resNo: p.resNo ?? undefined,
        checkin: p.checkin ?? undefined,
        checkout: p.checkout ?? undefined,
        price: p.price ? p.price.toLocaleString("ko-KR") : undefined,
        prepay: MAIL_RESORTS[target].prepay ? (p.prepay ?? undefined) : undefined,
        region: p.region ?? undefined,
        roomType: p.roomType ?? undefined,
      };
      const wanted = FIELD_IDS.filter((id) => id !== "prepay" || MAIL_RESORTS[target].prepay);
      const hits = wanted.filter((id) => found[id]);

      setFields((prev) => {
        const next = { ...prev };
        for (const id of hits) next[id] = found[id] as string;
        return next;
      });
      setMarks((prev) => {
        const next: Marks = { ...prev };
        for (const id of wanted) {
          if (found[id]) next[id] = "auto";
          else if (!fields[id]) next[id] = "miss";
        }
        return next;
      });
      setStatus(
        hits.length
          ? {
              text: `${hits.length}개 항목을 채웠습니다. 주황색 칸은 직접 확인해 주세요.`,
              tone: hits.length === wanted.length ? "ok" : "warn",
            }
          : { text: "붙여넣은 글자에서 예약정보를 찾지 못했습니다. 직접 입력해 주세요.", tone: "warn" },
      );
    },
    [resort, fields, pickResort],
  );

  const addImages = useCallback(async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length) return;
    const urls = await Promise.all(images.map(readAsDataUrl));
    setCaptures((prev) => [
      ...prev,
      ...urls.map((dataUrl, i) => ({
        dataUrl,
        name: `capture${prev.length + i + 1}.${extOf(dataUrl)}`,
      })),
    ]);
  }, []);

  // 화면 어디서든 Ctrl+V: 이미지는 캡처로, 글자는 예약정보로. 입력 칸 안에서의 붙여넣기는 건드리지 않는다.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = [...(e.clipboardData?.items ?? [])];
      const files = items
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length) {
        e.preventDefault();
        void addImages(files);
        return;
      }
      const el = e.target instanceof Element ? e.target.closest("input, textarea, select") : null;
      if (el && el !== rawRef.current) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      setRawText(text);
      applyText(text);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [addImages, applyText]);

  const setField = (id: FieldId, value: string) => {
    setFields((prev) => ({ ...prev, [id]: value }));
    setMarks((prev) => ({ ...prev, [id]: undefined }));
  };

  const updateSignature = (id: keyof MailSignature, value: string) => {
    const next = { ...signature, [id]: value };
    setSignature(next);
    store.set("signature", JSON.stringify(next));
  };

  const saveFixed = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    if (!store.set(`fixed.${resort}`, dataUrl)) {
      toast.error("이미지가 커서 저장하지 못했습니다. 이번 메일에만 들어갑니다.");
    }
    setFixedImages((prev) => ({ ...prev, [resort]: dataUrl }));
  };
  const clearFixed = () => {
    store.del(`fixed.${resort}`);
    setFixedImages((prev) => ({ ...prev, [resort]: undefined }));
  };
  const saveLogo = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await readAsDataUrl(file);
    if (!store.set("logo", dataUrl)) {
      toast.error("이미지가 커서 저장하지 못했습니다. 이번 메일에만 들어갑니다.");
    }
    setLogo(dataUrl);
  };

  /** 빈 칸이 있으면 물어본다. 메일에는 빈칸 표시(□□)가 그대로 나가기 때문이다. */
  const confirmMissing = (): boolean => {
    const miss: string[] = [];
    for (const id of FIELD_IDS) {
      if (id === "prepay" && !cfg.prepay) continue;
      if (!fields[id].trim()) miss.push(FIELD_LABEL[id]);
    }
    if (fields.checkin && !cancelIso) miss.push("취소 마감일");
    if (!signature.name.trim()) miss.push("서명 이름");
    return miss.length
      ? window.confirm(`아직 비어 있습니다: ${miss.join(", ")}\n그래도 진행할까요?`)
      : true;
  };

  const downloadEml = () => {
    if (!confirmMissing()) return;
    const images: EmlImage[] = [
      ...captures,
      ...(fixed ? [{ dataUrl: fixed, name: `guide.${extOf(fixed)}` }] : []),
      ...(logo ? [{ dataUrl: logo, name: `logo.${extOf(logo)}` }] : []),
    ];
    const eml = buildEml({
      subject,
      to,
      images,
      buildHtml: (cids) => {
        const rest = cids.slice(captures.length);
        return bodyFor({
          captures: cids.slice(0, captures.length),
          fixed: fixed ? rest[0] : null,
          logo: logo ? rest[fixed ? 1 : 0] : null,
        });
      },
    });
    const url = URL.createObjectURL(new Blob([eml], { type: "message/rfc822" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `[휴양소] 예약확정_${cfg.name}_${fields.name.trim() || "예약자"}.eml`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success(".eml 파일을 받았습니다. 열면 Outlook 새 메일로 열립니다.");
  };

  const copyBody = () => {
    if (!confirmMissing()) return;
    // copy 이벤트에서 HTML을 직접 넣어야 브라우저가 인라인 스타일을 지우지 않는다.
    const html = `<html><head><meta charset="utf-8"></head><body>${previewHtml}</body></html>`;
    const onCopy = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", previewRef.current?.innerText ?? "");
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", onCopy);
    if (ok) toast.success("본문을 복사했습니다. Outlook 본문에 Ctrl+V 하세요.");
    else toast.error("복사하지 못했습니다. .eml 만들기를 사용해 주세요.");
  };

  const copySubject = async () => {
    try {
      await navigator.clipboard.writeText(subject);
      toast.success("제목을 복사했습니다.");
    } catch {
      toast.error("제목을 복사하지 못했습니다.");
    }
  };

  const reset = () => {
    setFields(EMPTY_FIELDS);
    setMarks({});
    setCaptures([]);
    setRawText("");
    setStatus(null);
    setTo("");
    setCancelManual("");
    setPickedKey(null);
  };

  const fieldInput = (id: FieldId, props: React.ComponentProps<"input"> = {}) => (
    <Field label={FIELD_LABEL[id]}>
      <Input
        value={fields[id]}
        onChange={(e) => setField(id, e.target.value)}
        className={cn(marks[id] && MARK_CLASS[marks[id]])}
        {...props}
      />
    </Field>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>1. 예약 불러오기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="리조트">
              <select
                value={resort}
                onChange={(e) => {
                  if (isMailResortKey(e.target.value)) pickResort(e.target.value);
                }}
                className={selectClass}
              >
                {MAIL_RESORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {MAIL_RESORTS[key].label}
                  </option>
                ))}
              </select>
            </Field>

            {canFetch ? (
              <div className="space-y-2">
                <Input
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && needName && nameQuery.trim() && !fetching) {
                      void loadReservations();
                    }
                  }}
                  placeholder={needName ? "예약자 이름 (필수)" : "이름으로 찾기 (선택)"}
                />
                {needName && (
                  <p className="text-xs text-muted-foreground">
                    {cfg.name}는 예약이 많아 이름으로 찾아서 불러옵니다.
                  </p>
                )}
                <Button
                  className="w-full"
                  onClick={() => void loadReservations()}
                  disabled={fetching || (needName && !nameQuery.trim())}
                >
                  {fetching ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CloudDownload className="size-4" />
                  )}
                  {fetching
                    ? `${cfg.name}에 접속하는 중… (최대 1분)`
                    : fetchedList
                      ? "다시 불러오기"
                      : `${cfg.name} 예약 불러오기`}
                </Button>
                {fetchError && (
                  <p className="text-xs text-amber-700">
                    불러오지 못했습니다: {fetchError}
                    <br />
                    다시 시도하거나 아래 붙여넣기로 채워 주세요.
                  </p>
                )}
                {fetchedList && visibleList && (
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={peopleOnly}
                        onCheckedChange={(checked) => setPeopleOnly(checked)}
                      />
                      사람 이름만 보기
                      {peopleOnly && corporateCount > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          (법인 명의{" "}
                          <span className="font-mono tabular-nums">{corporateCount}</span>건 숨김)
                        </span>
                      )}
                    </label>
                    <p className="text-xs text-muted-foreground">
                      {needName && fetched ? "검색된 예약" : "앞으로의 예약"}{" "}
                      <span className="font-mono tabular-nums">{fetchedList.length}</span>건
                      {visibleList.length !== fetchedList.length && (
                        <>
                          {" "}
                          중 <span className="font-mono tabular-nums">{visibleList.length}</span>건
                        </>
                      )}{" "}
                      · 예약을 누르면 아래 칸이 채워집니다
                    </p>
                    <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
                      {visibleList.length === 0 && (
                        <li className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                          {fetchedList.length === 0
                            ? "앞으로의 예약이 없습니다."
                            : nameQuery && !needName
                              ? "그 이름의 예약이 없습니다."
                              : "이름이 지정된 예약이 없습니다. 체크를 풀면 법인 명의 예약도 보입니다."}
                        </li>
                      )}
                      {visibleList.map((r) => (
                        <li key={r.key}>
                          <button
                            type="button"
                            onClick={() => applyReservation(r)}
                            className={cn(
                              "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                              pickedKey === r.key && "border-primary bg-primary/5",
                            )}
                          >
                            <span className="flex items-baseline justify-between gap-2">
                              <span className={cn("font-medium", !r.name && "text-muted-foreground")}>
                                {r.name ?? "법인 명의 (사용자 미지정)"}
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums">
                                {fmtDot(r.checkin)} · {diffDaysIso(r.checkin, r.checkout)}박
                              </span>
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {[r.region, r.roomType, r.status].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                {cfg.label}는 아직 불러오기를 지원하지 않습니다. 아래에 예약 화면을 붙여넣어 주세요.
              </p>
            )}

            <p className="pt-1 text-xs font-medium text-muted-foreground">
              {canFetch ? "또는 예약 화면 붙여넣기 · " : "예약 화면 붙여넣기 · "}캡처 첨부(선택)
            </p>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void addImages([...e.dataTransfer.files]);
              }}
              className={cn(
                "cursor-pointer rounded-lg border-2 border-dashed border-border px-4 py-4 text-center text-sm text-muted-foreground transition-colors",
                dragOver && "border-primary bg-primary/5",
              )}
            >
              <p>
                <ClipboardPaste className="mr-1 inline size-4 align-text-bottom" />
                예약 화면의 <b className="text-foreground">글자를 드래그해 복사</b>한 뒤 여기서 Ctrl+V
              </p>
              <p className="mt-1 text-xs">
                <ImagePlus className="mr-1 inline size-3.5 align-text-bottom" />
                캡처 이미지(선택)도 Ctrl+V · 끌어다 놓기 · 클릭해서 선택 (메일 첨부용, 넣은 순서대로)
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                void addImages([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />

            {captures.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {captures.map((c, i) => (
                  <Thumb
                    key={`${c.name}-${i}`}
                    src={c.dataUrl}
                    order={i + 1}
                    onRemove={() => setCaptures((prev) => prev.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            )}

            {status && (
              <p
                className={cn(
                  "text-xs",
                  status.tone === "ok" ? "text-emerald-700" : "text-amber-700",
                )}
              >
                {status.text}
              </p>
            )}

            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">붙여넣은 글자 보기 · 고쳐서 다시 읽기</summary>
              <textarea
                ref={rawRef}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                rows={8}
                placeholder="예약 화면에서 복사한 글자"
                className="mt-2 w-full rounded-lg border border-input bg-transparent p-2 font-mono text-xs text-foreground outline-none focus-visible:border-ring"
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-1"
                disabled={!rawText.trim()}
                onClick={() => applyText(rawText)}
              >
                다시 읽기
              </Button>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. 예약정보 확인</CardTitle>
            <p className="text-xs text-muted-foreground">
              <span className="rounded bg-emerald-50 px-1 text-emerald-700">초록</span> 자동으로
              채움 · <span className="rounded bg-amber-50 px-1 text-amber-700">주황</span> 확인 필요
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {fieldInput("name")}
              {fieldInput("resNo")}
              {fieldInput("checkin", { type: "date" })}
              {fieldInput("checkout", { type: "date" })}
              {fieldInput("price", { inputMode: "numeric", placeholder: "196000" })}
              {cfg.prepay ? fieldInput("prepay", { type: "date" }) : <div />}
              {fieldInput("region")}
              {fieldInput("roomType")}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              {!fields.checkin ? (
                "입실일을 넣으면 취소 마감일이 계산됩니다."
              ) : cancel?.ok ? (
                <>
                  취소 마감일{" "}
                  <b className="font-mono tabular-nums">{fmtDot(cancel.iso)}</b>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {cancel.iso === cancel.rawIso
                      ? "입실 10일 전, 평일"
                      : `입실 10일 전 ${fmtDot(cancel.rawIso)} → ${[
                          cancel.resultSkipped.weekend
                            ? `주말 ${cancel.resultSkipped.weekend}일`
                            : "",
                          ...cancel.resultSkipped.holidays.map(
                            (h) => `${fmtMd(h.iso)} ${h.name}`,
                          ),
                        ]
                          .filter(Boolean)
                          .join(", ")} 이라서 앞당김`}
                  </span>
                </>
              ) : cancelFailed ? (
                <div className="space-y-2">
                  <p className="text-amber-800">
                    공휴일 정보를 확인하지 못해 취소 마감일을 계산하지 못했습니다. 직접 넣어
                    주세요.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={cancelManual}
                      onChange={(e) => setCancelManual(e.target.value)}
                      className="bg-background"
                    />
                    <Button variant="outline" onClick={() => void holidays.refetch()}>
                      다시 시도
                    </Button>
                  </div>
                </div>
              ) : (
                "공휴일 정보를 불러오는 중입니다…"
              )}
              {fields.checkin && fields.checkout && fields.checkout <= fields.checkin && (
                <p className="mt-1 font-medium text-amber-800">
                  퇴실일이 입실일보다 빠르거나 같습니다.
                </p>
              )}
            </div>

            <Field label="받는 사람 메일 (선택 · .eml에만 들어감)">
              <Input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="예약자 메일 주소"
              />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>설정</CardTitle>
            <p className="text-xs text-muted-foreground">
              이 브라우저에만 저장됩니다. 한 번 넣으면 다음에도 그대로 쓰입니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <details open={signatureOpen}>
              <summary className="cursor-pointer text-sm font-medium">보내는 사람 서명</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {SIGNATURE_FIELDS.map((f) => (
                  <Field
                    key={f.id}
                    label={f.label}
                    className={
                      f.id === "orgLine" || f.id === "address" || f.id === "slogan"
                        ? "col-span-2"
                        : undefined
                    }
                  >
                    <Input
                      value={signature[f.id]}
                      placeholder={f.placeholder}
                      onChange={(e) => updateSignature(f.id, e.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </details>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">서명 로고</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => logoFileRef.current?.click()}>
                  이미지 선택
                </Button>
                {logo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      store.del("logo");
                      setLogo(null);
                    }}
                  >
                    지우기
                  </Button>
                )}
              </div>
              {logo && <Thumb src={logo} />}
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void saveLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium">{cfg.label} 고정 안내 이미지</p>
              <p className="text-xs text-muted-foreground">
                이 리조트 메일에 항상 들어갑니다 (예: 펫 등록 안내, 스파 할인 안내).{" "}
                {fixed
                  ? cfg.guideFirst
                    ? "캡처 앞에 들어갑니다."
                    : "캡처 바로 다음에 들어갑니다."
                  : "지금은 없습니다."}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => fixedFileRef.current?.click()}>
                  이미지 선택
                </Button>
                {fixed && (
                  <Button variant="ghost" size="sm" onClick={clearFixed}>
                    지우기
                  </Button>
                )}
              </div>
              {fixed && <Thumb src={fixed} />}
              <input
                ref={fixedFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  void saveFixed(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <Card className="gap-0 py-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <p className="min-w-0 text-sm">
              <span className="text-muted-foreground">제목 </span>
              <span className="font-medium">{subject}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadEml}>
                <Mail />
                Outlook 메일(.eml) 만들기
              </Button>
              <Button variant="outline" onClick={copyBody}>
                <Copy />
                본문 복사
              </Button>
              <Button variant="outline" onClick={() => void copySubject()}>
                제목 복사
              </Button>
              <Button variant="ghost" onClick={reset}>
                <RotateCcw />새 예약
              </Button>
            </div>
          </div>
          {/* 메일 본문은 받는 쪽(Outlook) 기준의 인라인 스타일 HTML이다. 사람이 친 값은 `esc`를 거친다. */}
          <div
            ref={previewRef}
            className="overflow-x-auto bg-white px-6 py-5 [&_a]:text-[#0563C1] [&_a]:underline [&_img]:h-auto [&_img]:max-w-full"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        </Card>
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          <b>.eml</b> 파일을 열면 Outlook에서 새 메일(보내기 전 상태)로 열립니다.
          받는 사람만 확인하고 보내면 됩니다. <b>본문 복사</b>는 Outlook 새 메일 본문에 Ctrl+V —
          이미지가 안 붙으면 캡처만 따로 붙여넣어 주세요.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function Thumb({
  src,
  order,
  onRemove,
}: {
  src: string;
  order?: number;
  onRemove?: () => void;
}) {
  return (
    <div className="relative inline-block overflow-hidden rounded-md border bg-muted">
      {/* data URL이라 next/image가 할 일이 없다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="block h-20" />
      {order !== undefined && (
        <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[11px] text-white">
          {order}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="캡처 삭제"
          className="absolute top-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
