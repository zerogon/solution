/**
 * Slack incoming-webhook notifier for background crawl failures.
 *
 * The crawler runs unattended every few hours; without this, a resort that
 * starts failing (site redesign, expired credentials, IP block) is invisible
 * until someone opens /admin/logs. Configured by `SLACK_WEBHOOK_URL` — unset
 * simply disables notification, since this is an optional operational aid and
 * a missing webhook must never turn a partial crawl into a hard failure.
 */
export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[slack] webhook responded ${res.status}`);
    }
  } catch (e) {
    // Swallow: the caller is a failure handler already, and a notification
    // that fails must not mask the failure it was reporting.
    console.warn("[slack] notify failed", e instanceof Error ? e.message : e);
  }
}
