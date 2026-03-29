"use client";

import { useState } from "react";
import type { DashboardRate } from "@/db/queries";

interface Props {
  data: DashboardRate[];
}

type SortKey = "universityName" | "departmentName" | "applicants" | "accepted" | "rate";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: string; hideMobile?: boolean }[] = [
  { key: "universityName", label: "대학교", align: "text-left" },
  { key: "departmentName", label: "학과", align: "text-left" },
  { key: "applicants", label: "지원자", align: "text-right", hideMobile: true },
  { key: "accepted", label: "모집인원", align: "text-right", hideMobile: true },
  { key: "rate", label: "경쟁률", align: "text-right" },
];

/** 정렬 가능한 경쟁률 데이터 테이블 */
export default function SortableTable({ data }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("rate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...data].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const maxRate = sorted.length > 0 ? Math.max(...sorted.map((d) => d.rate)) : 1;

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400">데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`${col.align} px-5 py-3.5 text-sm font-semibold text-gray-600 cursor-pointer hover:text-blue-600 select-none ${
                    col.hideMobile ? "hidden md:table-cell" : ""
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 text-blue-500">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, index) => (
              <tr
                key={`${entry.departmentId}-${entry.year}`}
                className={`hover:bg-gray-50 transition-colors ${
                  index < sorted.length - 1 ? "border-b border-gray-50" : ""
                }`}
              >
                <td className="px-5 py-4 font-medium text-gray-900">{entry.universityName}</td>
                <td className="px-5 py-4 text-gray-700">{entry.departmentName}</td>
                <td className="px-5 py-4 text-right text-gray-600 hidden md:table-cell">
                  {entry.applicants.toLocaleString()}명
                </td>
                <td className="px-5 py-4 text-right text-gray-600 hidden md:table-cell">
                  {entry.accepted.toLocaleString()}명
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden lg:block w-16 bg-gray-100 rounded-full h-1.5">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${(entry.rate / maxRate) * 100}%` }}
                      />
                    </div>
                    <span className="text-blue-600 font-bold">{entry.rate.toFixed(1)}</span>
                    <span className="text-gray-400 text-sm">: 1</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
