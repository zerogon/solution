"use client";

import { useState } from "react";
import Image from "next/image";
import { UserIcon, UploadIcon, LoaderIcon } from "./Icons";
import { useToast } from "./Toast";

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
  imageUrl: "",
};

interface Props {
  initialData?: Partial<CharacterData>;
  onSubmit: (data: CharacterData) => Promise<void>;
  submitLabel: string;
}

function TextField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-600">
        {label} {required && <span className="text-danger-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1.5 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-600">{label}</label>
      <div className="mt-1.5 flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
        />
        {suffix && <span className="text-sm text-surface-400">{suffix}</span>}
      </div>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1.5 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none bg-card"
      >
        <option value="">선택</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-surface-600">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
      />
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
    <div>
      <label className="block text-sm font-medium text-surface-600">{label}</label>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          className="w-full rounded-lg border border-surface-300 bg-card px-3 py-2 text-sm transition-colors focus:border-primary-400 focus:ring-2 focus:ring-primary-100 focus:outline-none"
        />
        <input
          type="color"
          value={colorValue || "#000000"}
          onChange={(e) => onChangeColor(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border border-surface-300 p-0.5"
        />
      </div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-bold text-surface-700">
      <span className="h-4 w-1 rounded-full bg-primary-400" />
      {title}
    </h3>
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-surface-600">캐릭터 이미지</label>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl bg-surface-100">
            {data.imageUrl ? (
              <Image
                src={data.imageUrl}
                alt="캐릭터 이미지"
                fill
                unoptimized={data.imageUrl.startsWith("/uploads/")}
                className="object-cover"
                sizes="128px"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <UserIcon size={40} className="text-surface-300" />
              </div>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-surface-300 px-4 py-2.5 text-sm text-surface-600 transition-colors hover:bg-surface-50 hover:border-primary-300">
            {uploading ? (
              <>
                <LoaderIcon size={16} className="animate-spin" />
                업로드 중...
              </>
            ) : (
              <>
                <UploadIcon size={16} />
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
      </div>

      {/* Basic Info */}
      <section className="space-y-4">
        <SectionHeader title="기본 정보" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="이름" value={data.name} onChange={update("name")} required />
          <TextField label="배역" value={data.role} onChange={update("role")} />
          <SelectField
            label="성별"
            value={data.gender}
            onChange={update("gender")}
            options={[
              { value: "남자", label: "남자" },
              { value: "여자", label: "여자" },
            ]}
          />
          <DateField label="생일" value={data.birthday} onChange={update("birthday")} />
          <NumberField label="나이" value={data.age} onChange={update("age")} suffix="세" />
          <NumberField label="키" value={data.height} onChange={update("height")} suffix="cm" />
          <NumberField label="체중" value={data.weight} onChange={update("weight")} suffix="kg" />
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-4">
        <SectionHeader title="외형" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorTextField
            label="머리색"
            value={data.hairColor}
            onChangeText={update("hairColor")}
            colorValue={data.hairColorHex}
            onChangeColor={update("hairColorHex")}
          />
          <TextField label="헤어스타일" value={data.hairStyle} onChange={update("hairStyle")} />
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
        <SectionHeader title="설정" />
        <div className="space-y-4">
          <TextArea label="성격" value={data.personality} onChange={update("personality")} />
          <TextArea label="특징" value={data.features} onChange={update("features")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="지역" value={data.region} onChange={update("region")} />
            <TextField label="소속" value={data.affiliation} onChange={update("affiliation")} />
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="space-y-4">
        <SectionHeader title="스토리 관련" />
        <div className="space-y-4">
          <TextArea label="복선" value={data.foreshadowing} onChange={update("foreshadowing")} />
          <TextField label="사망" value={data.death} onChange={update("death")} />
        </div>
      </section>

      {/* Notes */}
      <section className="space-y-4">
        <SectionHeader title="기타" />
        <TextArea label="비고" value={data.notes} onChange={update("notes")} />
      </section>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting && <LoaderIcon size={16} className="animate-spin" />}
          {submitting ? "저장 중..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
