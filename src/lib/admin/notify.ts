/**
 * Pluggable admin notification.
 *
 * Channels are stacked: every notification is always written to
 * stderr (durable in Vercel logs / GH Actions logs) AND persisted via
 * the calling code's queue row. If RESEND_API_KEY + ADMIN_EMAIL are
 * set, the same notification is also pushed via email.
 *
 * Adding a Slack / Pushover / ntfy channel is a new branch here —
 * no callers need to change. Keep the interface in
 * `AdminNotification` stable.
 */

export interface AdminNotification {
  /** Short subject line; "[BeerBuddy] ..." prefix is added by sender. */
  subject: string;
  /** Long-form body. Plain text; renderers wrap as appropriate. */
  body: string;
  /** Chain or area the notification is about. */
  sourceId: string;
  /** Optional URL that the admin should look at to handle this. */
  sourceUrl?: string;
  /** Queue row this notification corresponds to (when applicable). */
  queueId?: number;
}

export async function notifyAdmin(notification: AdminNotification): Promise<void> {
  logToConsole(notification);
  await maybeSendEmail(notification);
}

function logToConsole(notification: AdminNotification): void {
  const line = [
    `[admin-notify] ${notification.subject}`,
    `source=${notification.sourceId}`,
    notification.queueId != null ? `queue=#${notification.queueId}` : null,
    notification.sourceUrl ? `url=${notification.sourceUrl}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  console.warn(line);
  if (notification.body && notification.body.trim().length > 0) {
    console.warn(`    ${notification.body.replace(/\n/g, "\n    ")}`);
  }
}

async function maybeSendEmail(notification: AdminNotification): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const toAddr = process.env.ADMIN_EMAIL;
  if (!apiKey || !toAddr) return;

  // Plain fetch — keeps the codebase free of a `resend` SDK dep.
  // The Resend REST API is stable enough that this is safe.
  const body = {
    from: "BeerBuddy <noreply@beerbuddy.local>",
    to: [toAddr],
    subject: notification.subject,
    text: composeBody(notification),
  };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(
        `[admin-notify] Resend rejected (${res.status}): ${await res.text()}`,
      );
    }
  } catch (err) {
    console.error(
      `[admin-notify] email send failed: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function composeBody(notification: AdminNotification): string {
  const lines = [notification.body, ""];
  if (notification.sourceUrl) {
    lines.push(`Source: ${notification.sourceUrl}`);
  }
  if (notification.queueId != null) {
    lines.push(`Queue entry: #${notification.queueId}`);
    lines.push(`Resolve at: /admin/parse-queue (admin-gated)`);
  }
  return lines.join("\n");
}
