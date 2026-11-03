import type { CreateEventResult, EventDto, EventPayload, EventSummary, MenuDto, PickDto } from "@/lib/events";
import type { CreateEventInput, CustomMenuInput, PickInput, UpdateEventInput } from "@/lib/validators";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // 본문 없음
  }
  if (!res.ok) {
    const msg =
      body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `요청에 실패했습니다 (HTTP ${res.status}).`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

export const api = {
  createEvent: (input: CreateEventInput) =>
    request<CreateEventResult>("/api/events", { method: "POST", body: JSON.stringify(input) }),

  listEvents: () => request<EventSummary[]>("/api/events"),

  updateEvent: (slug: string, input: UpdateEventInput) =>
    request<EventDto>(`/api/events/${slug}`, { method: "PATCH", body: JSON.stringify(input) }),

  deleteEvent: (slug: string) => request<{ ok: true }>(`/api/events/${slug}`, { method: "DELETE" }),

  getEvent: (slug: string) => request<EventPayload>(`/api/events/${slug}`),

  syncMenus: (slug: string) =>
    request<{ menuCount: number }>(`/api/events/${slug}/sync`, { method: "POST" }),

  addCustomMenu: (slug: string, input: CustomMenuInput) =>
    request<MenuDto>(`/api/events/${slug}/menus`, { method: "POST", body: JSON.stringify(input) }),

  setPick: (slug: string, input: PickInput) =>
    request<{ pick: PickDto | null }>(`/api/events/${slug}/picks`, {
      method: "PUT",
      body: JSON.stringify(input),
    }),
};
