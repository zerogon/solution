"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

interface AutocompleteItem {
  id: number;
  label: string;       // 표시할 텍스트
  sublabel?: string;   // 부제목 (대학명 등)
  type: "university" | "department";
}

interface Props {
  /** 초기 검색어 */
  defaultValue?: string;
  /** 검색 실행 콜백 (없으면 /search 페이지로 이동) */
  onSearch?: (query: string) => void;
  /** 플레이스홀더 텍스트 */
  placeholder?: string;
  /** 디바운스 딜레이 (ms) */
  debounceMs?: number;
  /** 자동 포커스 여부 */
  autoFocus?: boolean;
  /** 자동완성 비활성화 */
  disableAutocomplete?: boolean;
  /** 추가 클래스명 */
  className?: string;
}

/**
 * 대학/학과 통합 검색 바 컴포넌트
 * - 300ms 디바운스 처리
 * - 자동완성 드롭다운 (departments API 활용)
 * - 엔터/버튼으로 즉시 검색
 */
export default function SearchBar({
  defaultValue = "",
  onSearch,
  placeholder = "대학명 또는 학과명을 입력하세요...",
  debounceMs = 300,
  autoFocus = false,
  disableAutocomplete = false,
  className = "",
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 자동완성 데이터 가져오기
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim() || disableAutocomplete) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `/api/departments?search=${encodeURIComponent(q)}&limit=8`
      );
      if (!res.ok) return;
      const json = await res.json();
      const items: AutocompleteItem[] = (json.data ?? []).map(
        (d: { id: number; name: string; universityName: string }) => ({
          id: d.id,
          label: d.name,
          sublabel: d.universityName,
          type: "department" as const,
        })
      );
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch {
      // API 오류 시 자동완성 무시
      setSuggestions([]);
    }
  }, [disableAutocomplete]);

  // 디바운스 처리
  useEffect(() => {
    if (disableAutocomplete) return;
    const timer = setTimeout(() => {
      fetchSuggestions(query);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, debounceMs, fetchSuggestions, disableAutocomplete]);

  // 검색어 변경 콜백 (onSearch가 있을 때)
  useEffect(() => {
    if (!onSearch) return;
    const timer = setTimeout(() => {
      onSearch(query);
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [query, onSearch, debounceMs]);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setShowSuggestions(false);
    if (!trimmed) return;
    if (onSearch) {
      onSearch(trimmed);
    } else {
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleSelectSuggestion = (item: AutocompleteItem) => {
    setQuery(item.label);
    setShowSuggestions(false);
    if (onSearch) {
      onSearch(item.label);
    } else {
      router.push(`/search?q=${encodeURIComponent(item.label)}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
    if (onSearch) onSearch("");
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit} className="flex items-center">
        {/* 검색 아이콘 */}
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none select-none z-10">
          🔍
        </span>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(-1);
          }}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-label="검색어 입력"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          className="w-full pl-11 pr-24 py-3 rounded-xl border border-gray-200 bg-white shadow-sm
            focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent
            text-gray-900 placeholder-gray-400 transition-shadow"
        />

        {/* 지우기 버튼 */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="검색어 지우기"
            className="absolute right-20 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            ✕
          </button>
        )}

        {/* 검색 버튼 */}
        <button
          type="submit"
          aria-label="검색"
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 hover:bg-blue-700
            text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          검색
        </button>
      </form>

      {/* 자동완성 드롭다운 */}
      {showSuggestions && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden"
        >
          {suggestions.map((item, index) => (
            <li
              key={`${item.type}-${item.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectSuggestion(item);
              }}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                index === selectedIndex ? "bg-blue-50" : "hover:bg-gray-50"
              }`}
            >
              <span className="text-gray-400 text-sm shrink-0">
                {item.type === "department" ? "📚" : "🏫"}
              </span>
              <div>
                <span className="text-gray-900 text-sm font-medium">{item.label}</span>
                {item.sublabel && (
                  <span className="text-gray-400 text-xs ml-2">{item.sublabel}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
