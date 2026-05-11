/**
 * /admin/parse-queue — manual-intervention queue UI.
 *
 * Replaces the LLM circular-parsing path that was omitted on
 * 2026-05-10. When an adapter calls `queueManualParse`, a row lands
 * here; the admin opens this page, handles each entry out-of-band
 * (their own Anthropic SDK, OCR, eyeballs, whatever), enters the
 * resulting prices via /admin/indie, then marks the row resolved.
 *
 * Same ?key=ADMIN_PASSWORD gate as the other admin pages.
 */

import { redirect } from "next/navigation";

import { AdminNav } from "../_components/AdminNav";
import type { QueueEntry } from "@/lib/admin/parseQueue";

export const dynamic = "force-dynamic";

export default async function AdminParseQueuePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const providedKey = asString(sp.key);
  const expected = process.env.ADMIN_PASSWORD;

  if (!expected || expected.length === 0) {
    return <AdminDisabledScreen />;
  }
  if (!providedKey || providedKey !== expected) {
    return <KeyPrompt incorrect={providedKey != null && providedKey.length > 0} />;
  }

  let pending: QueueEntry[] = [];
  let recentlyResolved: QueueEntry[] = [];
  let dbError: string | null = null;
  try {
    const { listPending, listResolved } = await import("@/lib/admin/parseQueue");
    [pending, recentlyResolved] = await Promise.all([
      listPending(100),
      listResolved(15),
    ]);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const okMsg = asString(sp.ok);
  const errMsg = asString(sp.err);

  return (
    <main className="mx-auto max-w-[720px] min-h-screen px-4 py-6">
      <header className="mb-4">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          Parse queue
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mt-1">
          {pending.length} pending · admin only
        </p>
      </header>

      <AdminNav adminKey={providedKey} active="parse-queue" />

      {okMsg && <Notice tone="success">{okMsg}</Notice>}
      {errMsg && <Notice tone="error">{errMsg}</Notice>}
      {dbError && <Notice tone="error">Database unreachable: {dbError}</Notice>}

      <section className="mt-2">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-2">
          Pending
        </h2>
        {dbError ? (
          <p className="text-[13px] text-muted py-6 text-center">
            Can&rsquo;t load the queue without a database.
          </p>
        ) : pending.length === 0 ? (
          <p className="text-[13px] text-muted py-6 text-center">
            Queue is empty. Adapters haven&rsquo;t flagged anything for manual
            attention.
          </p>
        ) : (
          <ol className="m-0 p-0 list-none divide-y divide-rule">
            {pending.map((e) => (
              <li key={e.id}>
                <PendingRow entry={e} adminKey={providedKey} />
              </li>
            ))}
          </ol>
        )}
      </section>

      {recentlyResolved.length > 0 && (
        <section className="mt-10">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-2">
            Recently resolved
          </h2>
          <ol className="m-0 p-0 list-none divide-y divide-rule-soft">
            {recentlyResolved.map((e) => (
              <li key={e.id}>
                <ResolvedRow entry={e} adminKey={providedKey} />
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="mt-10 pt-4 border-t border-rule text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        Admin only · never linked publicly
      </footer>
    </main>
  );
}

function PendingRow({
  entry,
  adminKey,
}: {
  entry: QueueEntry;
  adminKey: string;
}) {
  async function doResolve(formData: FormData) {
    "use server";
    const notes = (formData.get("notes") as string | null)?.trim() ?? "";
    try {
      const { markResolved } = await import("@/lib/admin/parseQueue");
      await markResolved({
        id: entry.id,
        resolvedBy: "admin-ui",
        notes: notes || undefined,
      });
      redirect(
        `/admin/parse-queue?key=${encodeURIComponent(adminKey)}&ok=${encodeURIComponent(
          `Resolved #${entry.id}`,
        )}`,
      );
    } catch (err) {
      // Next.js redirects raise NEXT_REDIRECT internally; let that bubble.
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/admin/parse-queue?key=${encodeURIComponent(adminKey)}&err=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-cool">
          {entry.sourceId}
          <span className="text-muted ml-1.5">· {entry.kind}</span>
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
          #{entry.id} · {relativeTime(entry.queuedAt)}
        </span>
      </div>
      <p className="text-[13px] text-ink leading-relaxed">{entry.hint}</p>
      {entry.sourceUrl && (
        <p className="font-mono text-[11px] text-cool mt-1.5 break-all">
          <a
            href={entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-rule decoration-1 underline-offset-[3px] hover:decoration-ink"
          >
            {entry.sourceUrl}
          </a>
          {entry.mediaType && (
            <span className="text-muted ml-1.5">({entry.mediaType})</span>
          )}
        </p>
      )}
      <form action={doResolve} className="flex gap-2 mt-3">
        <input
          type="text"
          name="notes"
          placeholder="Resolution note (optional)"
          className="flex-1 font-mono text-[12px] border border-rule rounded-sm px-3 py-1.5 min-h-9 focus:outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="font-body text-[12px] font-medium border border-ink rounded-sm px-3 py-1.5 min-h-9 hover:bg-bg-soft transition-colors duration-micro ease-settle"
        >
          Mark resolved
        </button>
      </form>
    </article>
  );
}

function ResolvedRow({
  entry,
  adminKey,
}: {
  entry: QueueEntry;
  adminKey: string;
}) {
  async function doReopen() {
    "use server";
    try {
      const { reopen } = await import("@/lib/admin/parseQueue");
      await reopen(entry.id);
      redirect(
        `/admin/parse-queue?key=${encodeURIComponent(adminKey)}&ok=${encodeURIComponent(
          `Reopened #${entry.id}`,
        )}`,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/admin/parse-queue?key=${encodeURIComponent(adminKey)}&err=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <article className="py-2.5 text-[12px] text-muted">
      <div className="flex items-baseline justify-between gap-2">
        <span>
          <span className="font-mono uppercase tracking-[0.16em]">
            #{entry.id} · {entry.sourceId}
          </span>
          {entry.resolutionNotes && (
            <span className="ml-2">— {entry.resolutionNotes}</span>
          )}
        </span>
        <form action={doReopen}>
          <button
            type="submit"
            className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted hover:text-ink underline decoration-rule decoration-1 underline-offset-[3px]"
          >
            reopen
          </button>
        </form>
      </div>
    </article>
  );
}

function KeyPrompt({ incorrect }: { incorrect: boolean }) {
  return (
    <main className="mx-auto max-w-[420px] min-h-screen px-4 py-12 flex flex-col justify-center">
      <h1 className="font-display font-medium text-[22px] tracking-tight mb-1">
        Admin
      </h1>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-4">
        Restricted area
      </p>
      <form method="GET" className="flex gap-2">
        <input
          type="password"
          name="key"
          placeholder="Admin key"
          aria-label="Admin key"
          required
          className="flex-1 font-mono text-[14px] border border-rule rounded-sm px-3 py-2 min-h-11 focus:outline-none focus:border-ink"
        />
        <button
          type="submit"
          className="font-body text-[13px] font-medium bg-ink text-bg border border-ink rounded-sm px-4 py-2 min-h-11"
        >
          Enter
        </button>
      </form>
      {incorrect && (
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-warm mt-3">
          Incorrect key
        </p>
      )}
    </main>
  );
}

function AdminDisabledScreen() {
  return (
    <main className="mx-auto max-w-[420px] min-h-screen px-4 py-12 flex flex-col justify-center text-center">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Admin disabled
      </p>
      <p className="text-[12px] text-muted mt-2">
        Set ADMIN_PASSWORD in the environment to enable.
      </p>
    </main>
  );
}

function Notice({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-cool/40 bg-cool-soft text-ink"
      : "border-warm/40 bg-bg-soft text-ink";
  return (
    <div
      className={`border ${cls} rounded-sm py-2 px-3 mb-4 font-mono text-[11px]`}
    >
      {children}
    </div>
  );
}

function relativeTime(date: Date): string {
  const ms = Date.now() - date.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function asString(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}
