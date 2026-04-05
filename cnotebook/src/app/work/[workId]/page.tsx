"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import {
  Folder,
  Search,
  X,
  Plus,
  User,
  Sparkles,
  Pencil,
  Trash2,
  Check,
  FileText,
  ArrowLeft,
} from "lucide-react";
import Breadcrumb from "@/components/Breadcrumb";
import Modal from "@/components/Modal";
import { SkeletonCharacterCard } from "@/components/Skeleton";
import { useConfirm } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
  const reduce = useReducedMotion();
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
      const qp = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) qp.set(key, value);
        else qp.delete(key);
      });
      router.push(`/work/${workId}?${qp.toString()}`);
    },
    [searchParams, router, workId]
  );

  const fetchCharacters = useCallback(async () => {
    const qp = new URLSearchParams({ workId });
    if (search) qp.set("search", search);
    if (sort) qp.set("sort", sort);
    if (order) qp.set("order", order);
    if (folderId) qp.set("folderId", folderId);

    try {
      const res = await fetch(`/api/character?${qp.toString()}`);
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

  const sortValue = `${sort}-${order}`;

  return (
    <div className="space-y-8">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <Breadcrumb items={[{ label: workTitle || "..." }]} />
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            서재로
          </Link>
        </div>

        {/* Title */}
        <div className="flex flex-wrap items-center gap-2">
          {isEditingTitle ? (
            <>
              <Input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setIsEditingTitle(false);
                }}
                autoFocus
                className="h-auto max-w-md px-3 py-1.5 text-[1.75rem] font-semibold tracking-[-0.02em]"
              />
              <Button variant="ghost" size="icon-sm" onClick={handleSaveTitle}>
                <Check className="size-4 text-primary" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsEditingTitle(false)}
              >
                <X className="size-4" />
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-[1.75rem] font-semibold tracking-[-0.02em] leading-[1.22] text-foreground sm:text-[1.875rem]">
                {workTitle}
              </h1>
              <div className="flex items-center gap-0.5 opacity-60 transition-opacity hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    setEditTitle(workTitle);
                    setIsEditingTitle(true);
                  }}
                  aria-label="작품명 수정"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleSoftDelete}
                  aria-label="작품 삭제"
                  className="hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/work/${workId}/writing`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <FileText className="size-3.5" />
            글쓰기
          </Link>
          <Button
            variant={showFolderSidebar ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFolderSidebar(!showFolderSidebar)}
          >
            <Folder className="size-3.5" />
            폴더
          </Button>

          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="캐릭터 검색…"
              className="h-9 pl-8 pr-8"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput("");
                  updateParams({ search: "" });
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
                aria-label="검색 초기화"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select
            value={sortValue}
            onValueChange={(v) => {
              if (!v) return;
              const [s, o] = v.split("-");
              updateParams({ sort: s, order: o });
            }}
          >
            <SelectTrigger size="sm" className="h-9 min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">이름 오름차순</SelectItem>
              <SelectItem value="name-desc">이름 내림차순</SelectItem>
              <SelectItem value="age-asc">나이 오름차순</SelectItem>
              <SelectItem value="age-desc">나이 내림차순</SelectItem>
              <SelectItem value="gender-asc">성별 오름차순</SelectItem>
              <SelectItem value="gender-desc">성별 내림차순</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Separator />

      <div className="flex gap-6">
        {/* Folder Sidebar */}
        {showFolderSidebar && (
          <motion.aside
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="hidden w-56 shrink-0 md:block"
          >
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  폴더
                </h3>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setShowFolderModal(true)}
                  className="text-primary"
                >
                  <Plus className="size-3" />
                  추가
                </Button>
              </div>
              <Separator className="my-3" />
              <ul className="space-y-0.5">
                <li>
                  <button
                    onClick={() => updateParams({ folderId: "" })}
                    className={cn(
                      "w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                      !folderId
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground"
                    )}
                  >
                    전체
                  </button>
                </li>
                {folders.map((folder) => (
                  <li key={folder.id} className="group/folder flex items-center gap-1">
                    <button
                      onClick={() => updateParams({ folderId: folder.id })}
                      className={cn(
                        "flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                        folderId === folder.id
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground/80 hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {folder.name}
                      <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                        {folder._count.characters}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDeleteFolder(folder.id)}
                      className="rounded p-1 text-muted-foreground/50 opacity-0 transition-all hover:text-destructive group-hover/folder:opacity-100"
                      aria-label="폴더 삭제"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
              {folderId && (
                <button
                  onClick={openAddToFolder}
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus className="size-3" />
                  캐릭터 추가
                </button>
              )}
            </div>
          </motion.aside>
        )}

        {/* Character Grid */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCharacterCard key={i} />
              ))}
            </div>
          ) : characters.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-20 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-muted via-muted to-accent/30 text-muted-foreground ring-1 ring-border">
                <Sparkles className="size-6" strokeWidth={1.8} />
              </div>
              <p className="mt-5 text-[14.5px] font-medium text-foreground">
                {search ? "검색 결과가 없습니다" : "등록된 캐릭터가 없습니다"}
              </p>
              {!search && (
                <p className="mt-1 text-[13px] text-muted-foreground">
                  우측 하단의 + 버튼으로 첫 캐릭터를 추가해보세요.
                </p>
              )}
            </div>
          ) : (
            <motion.div
              className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 1 },
                show: {
                  opacity: 1,
                  transition: {
                    staggerChildren: reduce ? 0 : 0.03,
                    delayChildren: 0.02,
                  },
                },
              }}
            >
              {characters.map((char) => (
                <motion.div
                  key={char.id}
                  variants={{
                    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 6 },
                    show: {
                      opacity: 1,
                      y: 0,
                      transition: {
                        duration: 0.22,
                        ease: [0.22, 1, 0.36, 1],
                      },
                    },
                  }}
                  whileHover={reduce ? undefined : { y: -2 }}
                >
                  <Link
                    href={`/work/${workId}/character/${char.id}`}
                    className="group block rounded-xl border border-border bg-card p-3 transition-all hover:border-primary/40 hover:bg-gradient-to-b hover:from-primary/[0.03] hover:to-transparent"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-lg bg-muted ring-1 ring-border/60">
                      {char.imageUrl ? (
                        <Image
                          src={char.imageUrl}
                          alt={char.name}
                          fill
                          unoptimized={char.imageUrl.startsWith("/uploads/")}
                          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <User className="size-9 text-muted-foreground/50" strokeWidth={1.4} />
                        </div>
                      )}
                    </div>
                    <div className="mt-3 space-y-0.5 text-center">
                      <p className="truncate text-sm font-semibold tracking-[-0.005em] text-foreground transition-colors group-hover:text-primary">
                        {char.name}
                      </p>
                      {char.role && (
                        <p className="truncate text-xs text-muted-foreground">
                          {char.role}
                        </p>
                      )}
                      {(char.gender || char.age) && (
                        <p className="text-xs tabular-nums text-muted-foreground/80">
                          {[char.gender, char.age ? `${char.age}세` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {(char.hairColorHex || char.eyeColorHex) && (
                        <div className="flex items-center justify-center gap-1.5 pt-1">
                          {char.hairColorHex && (
                            <span
                              title={char.hairColor || "머리색"}
                              className="inline-block size-3 rounded-full ring-1 ring-border"
                              style={{ backgroundColor: char.hairColorHex }}
                            />
                          )}
                          {char.eyeColorHex && (
                            <span
                              title={char.eyeColor || "눈색"}
                              className="inline-block size-3 rounded-full ring-1 ring-border"
                              style={{ backgroundColor: char.eyeColorHex }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* FAB */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 28, delay: 0.1 }}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        className="fixed bottom-6 right-6 z-30 sm:bottom-8 sm:right-8"
      >
        <Link
          href={`/work/${workId}/character/new`}
          className="group flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-fab ring-1 ring-primary/30 transition-all hover:shadow-[0_10px_28px_-8px] hover:shadow-primary/50"
          aria-label="캐릭터 추가"
        >
          <Plus className="size-6" strokeWidth={2.2} />
        </Link>
      </motion.div>

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
        <form onSubmit={handleCreateFolder} className="space-y-4">
          <Input
            type="text"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="폴더 이름"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowFolderModal(false);
                setFolderName("");
              }}
            >
              취소
            </Button>
            <Button type="submit" disabled={!folderName.trim()}>
              생성
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Characters to Folder Modal */}
      <Modal
        open={showAddToFolder}
        onClose={() => setShowAddToFolder(false)}
        title="폴더에 캐릭터 추가"
      >
        <ScrollArea className="max-h-64">
          <div className="space-y-0.5 pr-2">
            {allCharacters.map((char) => (
              <label
                key={char.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selectedCharIds.includes(char.id)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedCharIds([...selectedCharIds, char.id]);
                    } else {
                      setSelectedCharIds(
                        selectedCharIds.filter((id) => id !== char.id)
                      );
                    }
                  }}
                  className="size-4 rounded border-border text-primary accent-primary"
                />
                <span className="text-[13px] text-foreground">{char.name}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setShowAddToFolder(false)}>
            취소
          </Button>
          <Button onClick={handleAddToFolder} disabled={selectedCharIds.length === 0}>
            추가 ({selectedCharIds.length})
          </Button>
        </div>
      </Modal>
    </div>
  );
}
