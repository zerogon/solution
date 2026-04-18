"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface TodayStats {
  total: number;
  dailySentence: number;
  zodiacFortune: number;
}

interface DailyRow {
  date: string;
  total: number;
  dailySentence: number;
  zodiacFortune: number;
}

interface MonthlyRow {
  month: string;
  total: number;
  dailySentence: number;
  zodiacFortune: number;
}

interface IdeaRow {
  id: number;
  name: string | null;
  content: string;
  createdAt: string;
}

interface AllStats {
  today: TodayStats;
  daily: DailyRow[];
  monthly: MonthlyRow[];
  ideas: IdeaRow[];
}

type Tab = "today" | "daily" | "monthly" | "ideas";

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [stats, setStats] = useState<AllStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    const saved = sessionStorage.getItem("admin_auth");
    if (saved === "true") {
      setAuthenticated(true);
    }
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stats?password=300");
      if (res.ok) {
        setStats(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) fetchStats();
  }, [authenticated]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "300") {
      setAuthenticated(true);
      sessionStorage.setItem("admin_auth", "true");
      setError(false);
    } else {
      setError(true);
    }
  };

  if (!authenticated) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center text-2xl">관리자 인증</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="비밀번호 입력"
                autoFocus
                className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2.5 text-lg text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              {error && (
                <p className="text-sm text-red-500">
                  비밀번호가 올바르지 않습니다.
                </p>
              )}
              <button
                type="submit"
                className="rounded-lg bg-primary px-4 py-2.5 text-lg font-medium text-white transition-colors hover:bg-primary/90"
              >
                확인
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "today", label: "오늘" },
    { key: "daily", label: "일별" },
    { key: "monthly", label: "월별" },
    { key: "ideas", label: "아이디어" },
  ];

  const formatDateTime = (dt: string) => {
    const d = new Date(dt);
    const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const month = kst.getUTCMonth() + 1;
    const day = kst.getUTCDate();
    const hours = kst.getUTCHours();
    const minutes = String(kst.getUTCMinutes()).padStart(2, "0");
    return `${month}/${day} ${hours}:${minutes}`;
  };

  const formatDate = (d: string) => {
    const parts = d.split("-");
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  const formatMonth = (m: string) => {
    const parts = m.split("-");
    return `${parts[0].slice(2)}년 ${parseInt(parts[1])}월`;
  };

  const toNumber = (v: unknown) => Number(v) || 0;

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8">
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-foreground">통계</h1>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
          >
            {loading ? "로딩..." : "새로고침"}
          </button>
        </div>

        <div className="mb-6 flex gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-full px-4 py-1.5 text-base font-medium transition-all ${
                tab === t.key
                  ? "bg-primary text-white shadow-md"
                  : "bg-secondary text-foreground/60 hover:text-foreground/80"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {stats && tab === "today" && (
          <div className="flex flex-col gap-4">
            <StatCard label="오늘의 방문자" value={toNumber(stats.today.total)} />
            <StatCard
              label="오늘의 문장 조회"
              value={toNumber(stats.today.dailySentence)}
            />
            <StatCard
              label="띠별 운세 조회"
              value={toNumber(stats.today.zodiacFortune)}
            />
          </div>
        )}

        {stats && tab === "daily" && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-normal text-foreground/60">
                  일별 방문자 추이 (최근 30일)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.daily}>
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(l) => l}
                        formatter={(value: number, name: string) => [
                          value,
                          name === "dailySentence"
                            ? "오늘의 문장"
                            : name === "zodiacFortune"
                              ? "띠별 운세"
                              : "전체",
                        ]}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value === "dailySentence"
                            ? "오늘의 문장"
                            : value === "zodiacFortune"
                              ? "띠별 운세"
                              : "전체"
                        }
                      />
                      <Bar
                        dataKey="total"
                        fill="oklch(0.65 0.2 250)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="dailySentence"
                        fill="oklch(0.7 0.15 150)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="zodiacFortune"
                        fill="oklch(0.7 0.15 30)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-normal text-foreground/60">
                  일별 상세
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10 text-foreground/50">
                      <th className="py-2 text-left font-medium">날짜</th>
                      <th className="py-2 text-right font-medium">전체</th>
                      <th className="py-2 text-right font-medium">문장</th>
                      <th className="py-2 text-right font-medium">운세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.daily].reverse().map((row) => (
                      <tr
                        key={row.date}
                        className="border-b border-foreground/5"
                      >
                        <td className="py-2 text-foreground/80">{row.date}</td>
                        <td className="py-2 text-right font-medium">
                          {toNumber(row.total)}
                        </td>
                        <td className="py-2 text-right">
                          {toNumber(row.dailySentence)}
                        </td>
                        <td className="py-2 text-right">
                          {toNumber(row.zodiacFortune)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.daily.length === 0 && (
                  <p className="py-4 text-center text-foreground/40">
                    데이터가 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {stats && tab === "ideas" && (
          <div className="flex flex-col gap-4">
            {stats.ideas.length === 0 ? (
              <Card>
                <CardContent>
                  <p className="py-4 text-center text-foreground/40">
                    아직 접수된 아이디어가 없습니다.
                  </p>
                </CardContent>
              </Card>
            ) : (
              stats.ideas.map((idea) => (
                <Card key={idea.id}>
                  <CardContent className="pt-5">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground/80">
                        {idea.name || "익명"}
                      </span>
                      <span className="text-xs text-foreground/40">
                        {formatDateTime(idea.createdAt)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground">
                      {idea.content}
                    </p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )}

        {stats && tab === "monthly" && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-normal text-foreground/60">
                  월별 방문자 추이 (최근 12개월)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.monthly}>
                      <XAxis
                        dataKey="month"
                        tickFormatter={formatMonth}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={formatMonth}
                        formatter={(value: number, name: string) => [
                          value,
                          name === "dailySentence"
                            ? "오늘의 문장"
                            : name === "zodiacFortune"
                              ? "띠별 운세"
                              : "전체",
                        ]}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value === "dailySentence"
                            ? "오늘의 문장"
                            : value === "zodiacFortune"
                              ? "띠별 운세"
                              : "전체"
                        }
                      />
                      <Bar
                        dataKey="total"
                        fill="oklch(0.65 0.2 250)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="dailySentence"
                        fill="oklch(0.7 0.15 150)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="zodiacFortune"
                        fill="oklch(0.7 0.15 30)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-normal text-foreground/60">
                  월별 상세
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-foreground/10 text-foreground/50">
                      <th className="py-2 text-left font-medium">월</th>
                      <th className="py-2 text-right font-medium">전체</th>
                      <th className="py-2 text-right font-medium">문장</th>
                      <th className="py-2 text-right font-medium">운세</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.monthly].reverse().map((row) => (
                      <tr
                        key={row.month}
                        className="border-b border-foreground/5"
                      >
                        <td className="py-2 text-foreground/80">
                          {formatMonth(row.month)}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {toNumber(row.total)}
                        </td>
                        <td className="py-2 text-right">
                          {toNumber(row.dailySentence)}
                        </td>
                        <td className="py-2 text-right">
                          {toNumber(row.zodiacFortune)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.monthly.length === 0 && (
                  <p className="py-4 text-center text-foreground/40">
                    데이터가 없습니다.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground/60 text-base font-normal">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold text-foreground">
          {value}
          <span className="ml-1 text-lg font-normal text-foreground/50">
            명
          </span>
        </p>
      </CardContent>
    </Card>
  );
}
