/**
 * /admin/aliases — product-alias candidate-match UI.
 *
 * Password-gated (Zero User Labor § "never linked publicly"). Access
 * via `/admin/aliases?key=ADMIN_PASSWORD`. If the key is missing or
 * wrong, the page renders a minimal entry form instead of the
 * candidate list — no information leakage.
 *
 * Companion to /api/admin/aliases. This page is what the developer
 * uses by hand; the route is for scripts.
 */

import { redirect } from "next/navigation";

import { AdminNav } from "../_components/AdminNav";
import type { CandidatePair } from "@/lib/admin/aliases";

export const dynamic = "force-dynamic";

export default async function AdminAliasesPage(props: {
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

  // Lazy import — pulls in @/lib/db, which throws at module-eval
  // time without DATABASE_URL. Keep it inside the auth gate so the
  // public unauthenticated screen renders even on misconfigured envs.
  let candidates: CandidatePair[] = [];
  let dbError: string | null = null;
  try {
    const { findAliasCandidates } = await import("@/lib/admin/aliases");
    candidates = await findAliasCandidates(100);
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const mergedParam = asString(sp.merged);
  const errorParam = asString(sp.err);

  return (
    <main className="mx-auto max-w-[720px] min-h-screen px-4 py-6">
      <header className="mb-4">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          Alias candidates
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mt-1">
          {candidates.length} pair{candidates.length === 1 ? "" : "s"} to review · admin only
        </p>
      </header>

      <AdminNav adminKey={providedKey} active="aliases" />

      {mergedParam && (
        <Notice tone="success">
          Merged. {mergedParam}.
        </Notice>
      )}
      {errorParam && (
        <Notice tone="error">
          Merge failed: {errorParam}.
        </Notice>
      )}
      {dbError && (
        <Notice tone="error">
          Database unreachable: {dbError}.
        </Notice>
      )}

      {dbError ? (
        <p className="text-[14px] text-muted py-12 text-center">
          Can&rsquo;t load candidates without a database.
          <br />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            Set DATABASE_URL in the environment and reload.
          </span>
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-[14px] text-muted py-12 text-center">
          No candidates surfaced.
          <br />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
            All products either unique or already merged.
          </span>
        </p>
      ) : (
        <ol className="m-0 p-0 list-none divide-y divide-rule">
          {candidates.map((pair) => (
            <li key={`${pair.leftId}-${pair.rightId}`}>
              <CandidateRow pair={pair} adminKey={providedKey} />
            </li>
          ))}
        </ol>
      )}

      <footer className="mt-10 pt-4 border-t border-rule text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        Admin only · never linked publicly
      </footer>
    </main>
  );
}

function CandidateRow({
  pair,
  adminKey,
}: {
  pair: CandidatePair;
  adminKey: string;
}) {
  const pct = Math.round(pair.similarity * 100);
  return (
    <article className="py-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
          {pair.packSize > 1 ? `${pair.packSize}-pack` : "single"}
          {pair.packUnitMl > 0 && (
            <>
              <span className="mx-1.5">·</span>
              {pair.packUnitMl}mL
            </>
          )}
        </span>
        <span
          className={`font-mono text-[10px] uppercase tracking-[0.18em] font-semibold ${
            pct >= 80 ? "text-warm" : "text-muted"
          }`}
        >
          {pct}% match
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Side
          id={pair.leftId}
          brand={pair.leftBrand}
          name={pair.leftName}
          sources={pair.leftSources}
        />
        <Side
          id={pair.rightId}
          brand={pair.rightBrand}
          name={pair.rightName}
          sources={pair.rightSources}
        />
      </div>

      <div className="flex gap-2 mt-3">
        <MergeForm
          adminKey={adminKey}
          sourceId={pair.rightId}
          targetId={pair.leftId}
          label="← Merge into left"
        />
        <MergeForm
          adminKey={adminKey}
          sourceId={pair.leftId}
          targetId={pair.rightId}
          label="Merge into right →"
        />
      </div>
    </article>
  );
}

function Side({
  id,
  brand,
  name,
  sources,
}: {
  id: number;
  brand: string;
  name: string;
  sources: string;
}) {
  return (
    <div className="border border-rule rounded-sm p-3">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted mb-0.5">
        #{id}
      </p>
      <p className="font-display font-medium text-[14px] leading-tight tracking-tight">
        {name}
      </p>
      <p className="text-[11px] text-muted mt-0.5">{brand}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-cool mt-2">
        {sources || "—"}
      </p>
    </div>
  );
}

function MergeForm({
  adminKey,
  sourceId,
  targetId,
  label,
}: {
  adminKey: string;
  sourceId: number;
  targetId: number;
  label: string;
}) {
  async function doMerge() {
    "use server";
    const { mergeAliases } = await import("@/lib/admin/aliases");
    try {
      const result = await mergeAliases(sourceId, targetId, "admin-ui");
      redirect(
        `/admin/aliases?key=${encodeURIComponent(adminKey)}&merged=${encodeURIComponent(
          `#${sourceId} → #${targetId} (${result.aliasesMoved} aliases, ${result.priceEventsRepointed} events)`,
        )}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/admin/aliases?key=${encodeURIComponent(adminKey)}&err=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <form action={doMerge} className="flex-1">
      <button
        type="submit"
        className="w-full font-body text-[12px] font-medium border border-ink rounded-sm py-1.5 px-3 min-h-9 hover:bg-bg-soft transition-colors duration-micro ease-settle"
      >
        {label}
      </button>
    </form>
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

function asString(v: string | string[] | undefined): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ?? "";
  return "";
}
