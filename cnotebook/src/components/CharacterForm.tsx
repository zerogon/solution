"use client";

import { useState } from "react";
import Image from "next/image";

export interface CharacterData {
  name: string;
  role: string;
  gender: string;
  birthday: string;
  age: string;
  height: string;
  weight: string;
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
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
  hairStyle: "",
  eyeColor: "",
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
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
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
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="mt-1 flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
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
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
      />
    </div>
  );
}

export default function CharacterForm({ initialData, onSubmit, submitLabel }: Props) {
  const [data, setData] = useState<CharacterData>({ ...INITIAL_DATA, ...initialData });
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      } else {
        alert(result.error);
      }
    } catch {
      alert("이미지 업로드에 실패했습니다.");
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Image Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700">캐릭터 이미지</label>
        <div className="mt-2 flex items-center gap-4">
          <div className="relative h-32 w-32 overflow-hidden rounded-xl bg-gray-100">
            {data.imageUrl ? (
              <Image
                src={data.imageUrl}
                alt="캐릭터 이미지"
                fill
                className="object-cover"
                sizes="128px"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-4xl text-gray-300">
                👤
              </div>
            )}
          </div>
          <label className="cursor-pointer rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            {uploading ? "업로드 중..." : "이미지 선택"}
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
      <section>
        <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
          기본 정보
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="이름" value={data.name} onChange={update("name")} required />
          <TextField label="배역" value={data.role} onChange={update("role")} />
          <TextField label="성별" value={data.gender} onChange={update("gender")} />
          <TextField label="생일" value={data.birthday} onChange={update("birthday")} />
          <NumberField label="나이" value={data.age} onChange={update("age")} suffix="세" />
          <NumberField label="키" value={data.height} onChange={update("height")} suffix="cm" />
          <NumberField label="체중" value={data.weight} onChange={update("weight")} suffix="kg" />
        </div>
      </section>

      {/* Appearance */}
      <section>
        <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
          외형
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="머리색" value={data.hairColor} onChange={update("hairColor")} />
          <TextField label="헤어스타일" value={data.hairStyle} onChange={update("hairStyle")} />
          <TextField label="눈색" value={data.eyeColor} onChange={update("eyeColor")} />
        </div>
      </section>

      {/* Settings */}
      <section>
        <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
          설정
        </h3>
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
      <section>
        <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
          스토리 관련
        </h3>
        <div className="space-y-4">
          <TextArea label="복선" value={data.foreshadowing} onChange={update("foreshadowing")} />
          <TextField label="사망" value={data.death} onChange={update("death")} />
        </div>
      </section>

      {/* Notes */}
      <section>
        <h3 className="mb-3 border-b border-gray-100 pb-2 text-sm font-bold text-gray-700">
          기타
        </h3>
        <TextArea label="비고" value={data.notes} onChange={update("notes")} />
      </section>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "저장 중..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
