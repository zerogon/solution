"use client";

import { useState } from "react";
import Image from "next/image";
import { User, Upload, Loader } from "lucide-react";
import { useToast } from "./Toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface CharacterData {
  name: string;
  role: string;
  gender: string;
  birthday: string;
  age: string;
  height: string;
  weight: string;
  hairColor: string;
  hairColorHex: string;
  hairStyle: string;
  eyeColor: string;
  eyeColorHex: string;
  personality: string;
  features: string;
  region: string;
  affiliation: string;
  foreshadowing: string;
  death: string;
  notes: string;
  aliases: string;
  imageUrl: string;
}

const INITIAL_DATA: CharacterData = {
  name: "",
  role: "",
  gender: "",
  birthday: "",
  age: "",
  height: "",
  weight: "",
  hairColor: "",
  hairColorHex: "",
  hairStyle: "",
  eyeColor: "",
  eyeColorHex: "",
  personality: "",
  features: "",
  region: "",
  affiliation: "",
  foreshadowing: "",
  death: "",
  notes: "",
  aliases: "",
  imageUrl: "",
};

interface Props {
  initialData?: Partial<CharacterData>;
  onSubmit: (data: CharacterData) => Promise<void>;
  submitLabel: string;
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  tone = "primary",
}: {
  eyebrow: string;
  title: string;
  tone?: "primary" | "accent";
}) {
  const toneClass = tone === "accent" ? "text-accent-foreground/85" : "text-primary";
  const dotClass = tone === "accent" ? "bg-accent-foreground/70" : "bg-primary";
  return (
    <div className="space-y-1.5">
      <p
        className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${toneClass}`}
      >
        <span aria-hidden className={`inline-block size-1 rounded-full ${dotClass}`} />
        {eyebrow}
      </p>
      <h3 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
        {title}
      </h3>
    </div>
  );
}

function ColorTextField({
  label,
  value,
  onChangeText,
  colorValue,
  onChangeColor,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  colorValue: string;
  onChangeColor: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
        />
        <input
          type="color"
          value={colorValue || "#000000"}
          onChange={(e) => onChangeColor(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5"
          aria-label={`${label} 색상`}
        />
      </div>
    </Field>
  );
}

export default function CharacterForm({ initialData, onSubmit, submitLabel }: Props) {
  const [data, setData] = useState<CharacterData>({ ...INITIAL_DATA, ...initialData });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const update = (field: keyof CharacterData) => (value: string) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const result = await res.json();
      if (res.ok) {
        setData((prev) => ({ ...prev, imageUrl: result.url }));
        toast("이미지가 업로드되었습니다", "success");
      } else {
        toast(result.error, "error");
      }
    } catch {
      toast("이미지 업로드에 실패했습니다", "error");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data.name.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* Image Upload */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Portrait" title="캐릭터 이미지" />
        <Separator />
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-muted ring-1 ring-border">
            {data.imageUrl ? (
              <Image
                src={data.imageUrl}
                alt="캐릭터 이미지"
                fill
                unoptimized={data.imageUrl.startsWith("/uploads/")}
                className="object-cover"
                sizes="112px"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <User className="size-9 text-muted-foreground/50" strokeWidth={1.4} />
              </div>
            )}
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
            {uploading ? (
              <>
                <Loader className="size-4 animate-spin" />
                업로드 중…
              </>
            ) : (
              <>
                <Upload className="size-4" />
                이미지 선택
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </section>

      {/* Basic Info */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Basic" title="기본 정보" />
        <Separator />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="이름" required>
            <Input
              type="text"
              value={data.name}
              onChange={(e) => update("name")(e.target.value)}
              required
            />
          </Field>
          <Field label="배역">
            <Input
              type="text"
              value={data.role}
              onChange={(e) => update("role")(e.target.value)}
            />
          </Field>
          <Field label="별칭" className="sm:col-span-2">
            <Input
              type="text"
              value={data.aliases}
              onChange={(e) => update("aliases")(e.target.value)}
              placeholder="쉼표로 구분 (예: 수현이, 현이, 대장)"
            />
          </Field>
          <Field label="성별">
            <Select
              value={data.gender || undefined}
              onValueChange={(v) => update("gender")(v ?? "")}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="남자">남자</SelectItem>
                <SelectItem value="여자">여자</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="생일">
            <Input
              type="date"
              value={data.birthday}
              onChange={(e) => update("birthday")(e.target.value)}
            />
          </Field>
          <Field label="나이">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={data.age}
                onChange={(e) => update("age")(e.target.value)}
              />
              <span className="text-[13px] text-muted-foreground">세</span>
            </div>
          </Field>
          <Field label="키">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={data.height}
                onChange={(e) => update("height")(e.target.value)}
              />
              <span className="text-[13px] text-muted-foreground">cm</span>
            </div>
          </Field>
          <Field label="체중">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={data.weight}
                onChange={(e) => update("weight")(e.target.value)}
              />
              <span className="text-[13px] text-muted-foreground">kg</span>
            </div>
          </Field>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Appearance" title="외형" tone="accent" />
        <Separator />
        <div className="grid gap-5 sm:grid-cols-2">
          <ColorTextField
            label="머리색"
            value={data.hairColor}
            onChangeText={update("hairColor")}
            colorValue={data.hairColorHex}
            onChangeColor={update("hairColorHex")}
          />
          <Field label="헤어스타일">
            <Input
              type="text"
              value={data.hairStyle}
              onChange={(e) => update("hairStyle")(e.target.value)}
            />
          </Field>
          <ColorTextField
            label="눈색"
            value={data.eyeColor}
            onChangeText={update("eyeColor")}
            colorValue={data.eyeColorHex}
            onChangeColor={update("eyeColorHex")}
          />
        </div>
      </section>

      {/* Settings */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Profile" title="설정" />
        <Separator />
        <div className="space-y-5">
          <Field label="성격">
            <Textarea
              value={data.personality}
              onChange={(e) => update("personality")(e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="특징">
            <Textarea
              value={data.features}
              onChange={(e) => update("features")(e.target.value)}
              rows={3}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="지역">
              <Input
                type="text"
                value={data.region}
                onChange={(e) => update("region")(e.target.value)}
              />
            </Field>
            <Field label="소속">
              <Input
                type="text"
                value={data.affiliation}
                onChange={(e) => update("affiliation")(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Story" title="스토리 관련" tone="accent" />
        <Separator />
        <div className="space-y-5">
          <Field label="복선">
            <Textarea
              value={data.foreshadowing}
              onChange={(e) => update("foreshadowing")(e.target.value)}
              rows={3}
            />
          </Field>
          <Field label="사망">
            <Input
              type="text"
              value={data.death}
              onChange={(e) => update("death")(e.target.value)}
            />
          </Field>
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-4">
        <SectionHeader eyebrow="Notes" title="기타" />
        <Separator />
        <Field label="비고">
          <Textarea
            value={data.notes}
            onChange={(e) => update("notes")(e.target.value)}
            rows={4}
          />
        </Field>
      </section>

      {/* Submit */}
      <div className="sticky bottom-0 -mx-4 flex justify-end border-t border-border bg-background/90 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting && <Loader className="size-4 animate-spin" />}
          {submitting ? "저장 중…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
