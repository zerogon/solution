import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EventView } from "@/components/event/EventView";
import { findEventBySlug, loadEventPayload } from "@/lib/events";
import { SLUG_RE } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) return {};
  const event = await findEventBySlug(slug);
  if (!event) return {};
  return {
    title: event.title,
    description: `${event.placeName} — 먹고 싶은 메뉴를 미리 담아 주세요`,
    openGraph: { title: event.title, description: `${event.placeName} 메뉴 장바구니` },
  };
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) notFound();
  const event = await findEventBySlug(slug);
  if (!event) notFound();
  const payload = await loadEventPayload(event);
  return <EventView slug={slug} initial={payload} />;
}
