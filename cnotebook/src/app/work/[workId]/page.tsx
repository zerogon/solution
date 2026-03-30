"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Character {
  id: string;
  name: string;
  imageUrl: string | null;
  gender: string | null;
  age: number | null;
}

interface Folder {
  id: string;
  name: string;
  _count: { characters: number };
}

export default function WorkPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const workId = params.workId as string;

  const [workTitle, setWorkTitle] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFolderSidebar, setShowFolderSidebar] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [showAddToFolder, setShowAddToFolder] = useState(false);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([]);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);

  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "name";
  const order = searchParams.get("order") || "asc";
  const folderId = searchParams.get("folderId") || "";

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value);
        else params.delete(key);
      });
      router.push(`/work/${workId}?${params.toString()}`);
    },
    [searchParams, router, workId]
  );

  const fetchCharacters = useCallback(async () => {
    const params = new URLSearchParams({ workId });
    if (search) params.set("search", search);
    if (sort) params.set("sort", sort);
    if (order) params.set("order", order);
    if (folderId) params.set("folderId", folderId);

    try {
      const res = await fetch(`/api/character?${params.toString()}`);
      const data = await res.json();
      setCharacters(Array.isArray(data) ? data : []);
    } catch {
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }, [workId, search, sort, order, folderId]);

  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch(`/api/folder?workId=${workId}`);
      const data = await res.json();
      setFolders(Array.isArray(data) ? data : []);
    } catch {
      setFolders([]);
    }
  }, [workId]);

  const fetchWork = useCallback(async () => {
    try {
      const res = await fetch("/api/work");
      const works = await res.json();
      const list = Array.isArray(works) ? works : [];
      const work = list.find((w: { id: string; title: string }) => w.id === workId);
      if (work) setWorkTitle(work.title);
    } catch {
      /* DB 미연결 시 무시 */
    }
  }, [workId]);

  useEffect(() => {
    fetchWork();
    fetchCharacters();
    fetchFolders();
  }, [fetchWork, fetchCharacters, fetchFolders]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        updateParams({ search: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, updateParams]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    await fetch("/api/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workId, name: folderName.trim() }),
    });
    setFolderName("");
    setShowFolderModal(false);
    fetchFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm("폴더를 삭제하시겠습니까?")) return;
    await fetch(`/api/folder/${id}`, { method: "DELETE" });
    if (folderId === id) updateParams({ folderId: "" });
    fetchFolders();
    fetchCharacters();
  };

  const handleAddToFolder = async () => {
    if (!folderId || selectedCharIds.length === 0) return;
    await fetch("/api/folder/add-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId, characterIds: selectedCharIds }),
    });
    setShowAddToFolder(false);
    setSelectedCharIds([]);
    fetchCharacters();
    fetchFolders();
  };

  const openAddToFolder = async () => {
    const res = await fetch(`/api/character?workId=${workId}`);
    const data = await res.json();
    setAllCharacters(data);
    setSelectedCharIds([]);
    setShowAddToFolder(true);
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-gray-600">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold">{workTitle}</h1>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowFolderSidebar(!showFolderSidebar)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100"
        >
          📁 폴더
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="캐릭터 검색..."
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                updateParams({ search: "" });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          )}
        </div>

        <select
          value={`${sort}-${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("-");
            updateParams({ sort: s, order: o });
          }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="name-asc">이름 오름차순</option>
          <option value="name-desc">이름 내림차순</option>
          <option value="age-asc">나이 오름차순</option>
          <option value="age-desc">나이 내림차순</option>
          <option value="gender-asc">성별 오름차순</option>
          <option value="gender-desc">성별 내림차순</option>
        </select>
      </div>

      <div className="mt-4 flex gap-4">
        {/* Folder Sidebar */}
        {showFolderSidebar && (
          <div className="w-56 shrink-0 rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">폴더</h3>
              <button
                onClick={() => setShowFolderModal(true)}
                className="text-xs text-blue-600 hover:underline"
              >
                + 추가
              </button>
            </div>
            <ul className="mt-3 space-y-1">
              <li>
                <button
                  onClick={() => updateParams({ folderId: "" })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${!folderId ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`}
                >
                  전체
                </button>
              </li>
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center">
                  <button
                    onClick={() => updateParams({ folderId: folder.id })}
                    className={`flex-1 rounded-lg px-3 py-2 text-left text-sm ${folderId === folder.id ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-gray-50"}`}
                  >
                    {folder.name}
                    <span className="ml-1 text-xs text-gray-400">
                      ({folder._count.characters})
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="px-1 text-xs text-gray-400 hover:text-red-500"
                  >
                    &times;
                  </button>
                </li>
              ))}
            </ul>
            {folderId && (
              <button
                onClick={openAddToFolder}
                className="mt-3 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600"
              >
                + 폴더에 캐릭터 추가
              </button>
            )}
          </div>
        )}

        {/* Character Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="py-12 text-center text-gray-400">불러오는 중...</div>
          ) : characters.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-400">
                {search ? "검색 결과가 없습니다." : "등록된 캐릭터가 없습니다."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {characters.map((char) => (
                <Link
                  key={char.id}
                  href={`/work/${workId}/character/${char.id}`}
                  className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
                    {char.imageUrl ? (
                      <Image
                        src={char.imageUrl}
                        alt={char.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-3xl text-gray-300">
                        👤
                      </div>
                    )}
                  </div>
                  <p className="mt-2 text-center text-sm font-medium truncate">
                    {char.name}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB - Add Character */}
      <Link
        href={`/work/${workId}/character/new`}
        className="fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl text-white shadow-lg hover:bg-blue-700"
      >
        +
      </Link>

      {/* Folder Create Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-bold">새 폴더</h2>
            <form onSubmit={handleCreateFolder} className="mt-3">
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="폴더 이름"
                className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowFolderModal(false);
                    setFolderName("");
                  }}
                  className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  생성
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Characters to Folder Modal */}
      {showAddToFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="font-bold">폴더에 캐릭터 추가</h2>
            <div className="mt-3 max-h-64 overflow-y-auto">
              {allCharacters.map((char) => (
                <label
                  key={char.id}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedCharIds.includes(char.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCharIds([...selectedCharIds, char.id]);
                      } else {
                        setSelectedCharIds(selectedCharIds.filter((id) => id !== char.id));
                      }
                    }}
                    className="rounded"
                  />
                  <span className="text-sm">{char.name}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowAddToFolder(false)}
                className="rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
              <button
                onClick={handleAddToFolder}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                추가 ({selectedCharIds.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
