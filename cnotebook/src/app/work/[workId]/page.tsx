"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import Breadcrumb from "@/components/Breadcrumb";
import Modal from "@/components/Modal";
import { SkeletonCharacterCard } from "@/components/Skeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import {
  FolderIcon,
  SearchIcon,
  XIcon,
  PlusIcon,
  UserIcon,
  SparklesIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
} from "@/components/Icons";

interface Character {
  id: string;
  name: string;
  imageUrl: string | null;
  role: string | null;
  gender: string | null;
  age: number | null;
  hairColor: string | null;
  hairColorHex: string | null;
  eyeColor: string | null;
  eyeColorHex: string | null;
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
  const { confirm } = useConfirm();
  const { toast } = useToast();

  const [workTitle, setWorkTitle] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
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
      const res = await fetch(`/api/work/${workId}`);
      if (!res.ok) return;
      const work = await res.json();
      if (work.deletedAt) {
        router.push("/");
        return;
      }
      setWorkTitle(work.title);
    } catch {
      /* ignore */
    }
  }, [workId, router]);

  useEffect(() => {
    fetchWork();
    fetchCharacters();
    fetchFolders();
  }, [fetchWork, fetchCharacters, fetchFolders]);

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
    const ok = await confirm({
      title: "폴더 삭제",
      message: "이 폴더를 삭제하시겠습니까? 캐릭터는 삭제되지 않습니다.",
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
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

  const handleSaveTitle = async () => {
    const trimmed = editTitle.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/work/${workId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.ok) {
        setWorkTitle(trimmed);
        setIsEditingTitle(false);
        toast("작품명이 수정되었습니다.", "success");
      } else {
        const data = await res.json();
        toast(data.error || "수정에 실패했습니다.", "error");
      }
    } catch {
      toast("수정에 실패했습니다.", "error");
    }
  };

  const handleSoftDelete = async () => {
    const ok = await confirm({
      title: "작품 삭제",
      message:
        "이 작품을 삭제하시겠습니까? 모든 캐릭터와 폴더가 함께 휴지통으로 이동되며, 30일 후 자동 삭제됩니다.",
      confirmLabel: "삭제",
      variant: "danger",
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/work/${workId}`, { method: "DELETE" });
      if (res.ok) {
        toast("작품이 휴지통으로 이동되었습니다.", "success");
        router.push("/");
      } else {
        const data = await res.json();
        toast(data.error || "삭제에 실패했습니다.", "error");
      }
    } catch {
      toast("삭제에 실패했습니다.", "error");
    }
  };

  const openAddToFolder = async () => {
    const res = await fetch(`/api/character?workId=${workId}`);
    const data = await res.json();
    setAllCharacters(data);
    setSelectedCharIds([]);
    setShowAddToFolder(true);
  };

  return (
    <div className="relative animate-fade-in">
      {/* Breadcrumb */}
      <Breadcrumb items={[{ label: workTitle || "..." }]} />

      {/* Title */}
      <div className="mt-3 flex items-center gap-2">
        {isEditingTitle ? (
          <>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveTitle();
                if (e.key === "Escape") setIsEditingTitle(false);
              }}
              autoFocus
              className="rounded-lg border border-primary-300 bg-card px-3 py-1.5 text-2xl font-bold text-surface-900 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            />
            <button
              onClick={handleSaveTitle}
              className="rounded-lg p-1.5 text-primary-600 transition-colors hover:bg-primary-50"
            >
              <CheckIcon size={20} />
            </button>
            <button
              onClick={() => setIsEditingTitle(false)}
              className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-surface-100"
            >
              <XIcon size={20} />
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-surface-900">{workTitle}</h1>
            <button
              onClick={() => {
                setEditTitle(workTitle);
                setIsEditingTitle(true);
              }}
              className="rounded-lg p-1.5 text-surface-400 transition-colors hover:text-surface-600"
            >
              <PencilIcon size={18} />
            </button>
            <button
              onClick={handleSoftDelete}
              className="rounded-lg p-1.5 text-surface-400 transition-colors hover:text-danger-500"
            >
              <TrashIcon size={18} />
            </button>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setShowFolderSidebar(!showFolderSidebar)}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
            showFolderSidebar
              ? "border-primary-300 bg-primary-50 text-primary-700"
              : "border-surface-300 text-surface-600 hover:bg-surface-100"
          }`}
        >
          <FolderIcon size={16} />
          폴더
        </button>

        <div className="relative flex-1">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400"
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="캐릭터 검색..."
            className="w-full rounded-lg border border-surface-300 bg-card py-2 pl-9 pr-9 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                updateParams({ search: "" });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-surface-400 transition-colors hover:text-surface-600"
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        <select
          value={`${sort}-${order}`}
          onChange={(e) => {
            const [s, o] = e.target.value.split("-");
            updateParams({ sort: s, order: o });
          }}
          className="rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm text-surface-600 transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
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
          <div className="w-56 shrink-0 animate-fade-in rounded-xl border border-surface-200 bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-surface-700">폴더</h3>
              <button
                onClick={() => setShowFolderModal(true)}
                className="flex items-center gap-0.5 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700"
              >
                <PlusIcon size={14} />
                추가
              </button>
            </div>
            <ul className="mt-3 space-y-0.5">
              <li>
                <button
                  onClick={() => updateParams({ folderId: "" })}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    !folderId
                      ? "border-l-2 border-l-primary-500 bg-primary-50 font-medium text-primary-700"
                      : "hover:bg-surface-50"
                  }`}
                >
                  전체
                </button>
              </li>
              {folders.map((folder) => (
                <li key={folder.id} className="flex items-center">
                  <button
                    onClick={() => updateParams({ folderId: folder.id })}
                    className={`flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      folderId === folder.id
                        ? "border-l-2 border-l-primary-500 bg-primary-50 font-medium text-primary-700"
                        : "hover:bg-surface-50"
                    }`}
                  >
                    {folder.name}
                    <span className="ml-1.5 text-xs text-surface-400">
                      ({folder._count.characters})
                    </span>
                  </button>
                  <button
                    onClick={() => handleDeleteFolder(folder.id)}
                    className="rounded p-1 text-surface-300 transition-colors hover:text-danger-500"
                  >
                    <XIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
            {folderId && (
              <button
                onClick={openAddToFolder}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-surface-300 px-3 py-2 text-xs text-surface-500 transition-colors hover:border-primary-400 hover:text-primary-600"
              >
                <PlusIcon size={14} />
                폴더에 캐릭터 추가
              </button>
            )}
          </div>
        )}

        {/* Character Grid */}
        <div className="flex-1">
          {loading ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCharacterCard key={i} />
              ))}
            </div>
          ) : characters.length === 0 ? (
            <div className="flex flex-col items-center py-16">
              <div className="rounded-2xl bg-surface-100 p-4">
                <SparklesIcon size={28} className="text-surface-400" />
              </div>
              <p className="mt-3 text-sm text-surface-400">
                {search ? "검색 결과가 없습니다" : "등록된 캐릭터가 없습니다"}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {characters.map((char) => (
                <Link
                  key={char.id}
                  href={`/work/${workId}/character/${char.id}`}
                  className="group rounded-xl border border-surface-200 bg-card p-3 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
                >
                  <div className="relative aspect-square overflow-hidden rounded-lg bg-surface-100">
                    {char.imageUrl ? (
                      <Image
                        src={char.imageUrl}
                        alt={char.name}
                        fill
                        className="object-cover transition-transform duration-200 group-hover:scale-105"
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <UserIcon size={36} className="text-surface-300" />
                      </div>
                    )}
                  </div>
                  <div className="mt-2 space-y-0.5 text-center">
                    <p className="truncate text-sm font-medium text-surface-700 dark:text-surface-900 transition-colors group-hover:text-primary-700">
                      {char.name}
                    </p>
                    {char.role && (
                      <p className="truncate text-xs text-surface-400 dark:text-surface-600">{char.role}</p>
                    )}
                    {(char.gender || char.age) && (
                      <p className="text-xs text-surface-500 dark:text-surface-600">
                        {[char.gender, char.age ? `${char.age}세` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {(char.hairColorHex || char.eyeColorHex) && (
                      <div className="flex items-center justify-center gap-1.5 pt-0.5">
                        {char.hairColorHex && (
                          <span
                            title={char.hairColor || "머리색"}
                            className="inline-block h-3.5 w-3.5 rounded-full border border-surface-200"
                            style={{ backgroundColor: char.hairColorHex }}
                          />
                        )}
                        {char.eyeColorHex && (
                          <span
                            title={char.eyeColor || "눈색"}
                            className="inline-block h-3.5 w-3.5 rounded-full border border-surface-200"
                            style={{ backgroundColor: char.eyeColorHex }}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FAB */}
      <Link
        href={`/work/${workId}/character/new`}
        className="group fixed bottom-8 right-8 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-fab transition-all duration-200 hover:scale-105 hover:bg-primary-700"
      >
        <PlusIcon size={24} />
        <span className="pointer-events-none absolute bottom-full right-0 mb-2 whitespace-nowrap rounded-lg bg-tooltip px-3 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          캐릭터 추가
        </span>
      </Link>

      {/* Folder Create Modal */}
      <Modal
        open={showFolderModal}
        onClose={() => {
          setShowFolderModal(false);
          setFolderName("");
        }}
        title="새 폴더"
        size="sm"
      >
        <form onSubmit={handleCreateFolder}>
          <input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="폴더 이름"
            className="w-full rounded-lg border border-surface-300 bg-card px-4 py-2.5 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
            autoFocus
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowFolderModal(false);
                setFolderName("");
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              생성
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Characters to Folder Modal */}
      <Modal
        open={showAddToFolder}
        onClose={() => setShowAddToFolder(false)}
        title="폴더에 캐릭터 추가"
      >
        <div className="max-h-64 overflow-y-auto">
          {allCharacters.map((char) => (
            <label
              key={char.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-50"
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
                className="rounded accent-primary-600"
              />
              <span className="text-sm text-surface-700">{char.name}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setShowAddToFolder(false)}
            className="rounded-lg px-3 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
          >
            취소
          </button>
          <button
            onClick={handleAddToFolder}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            추가 ({selectedCharIds.length})
          </button>
        </div>
      </Modal>
    </div>
  );
}
