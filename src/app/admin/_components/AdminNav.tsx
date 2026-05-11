/**
 * Shared admin-page navigation strip.
 *
 * Renders the cross-page links + a pending-count badge for the
 * manual parse queue, so every admin page surfaces how much work
 * is waiting. The count is fetched server-side per request — cheap
 * (single COUNT(*)) and always fresh.
 *
 * Degrades gracefully when DATABASE_URL isn't set: the badge just
 * disappears, the rest of the strip still renders.
 */

import Link from "next/link";

interface Props {
  /** Admin key to thread through to other admin links. */
  adminKey: string;
  /** Currently-active page key. */
  active: "aliases" | "indie" | "parse-queue";
}

const PAGES: Array<{ key: Props["active"]; label: string; href: string }> = [
  { key: "aliases", label: "Aliases", href: "/admin/aliases" },
  { key: "indie", label: "Indie prices", href: "/admin/indie" },
  { key: "parse-queue", label: "Parse queue", href: "/admin/parse-queue" },
];

export async function AdminNav({ adminKey, active }: Props) {
  let pending: number | null = null;
  try {
    const { pendingCount } = await import("@/lib/admin/parseQueue");
    pending = await pendingCount();
  } catch {
    pending = null; // DB unreachable — drop the badge silently.
  }

  return (
    <nav className="flex items-center gap-3 mb-4 pb-3 border-b border-rule">
      {PAGES.map((p) => {
        const isActive = p.key === active;
        const href = `${p.href}?key=${encodeURIComponent(adminKey)}`;
        const showBadge = p.key === "parse-queue" && pending != null && pending > 0;
        return (
          <Link
            key={p.key}
            href={href}
            prefetch={false}
            aria-current={isActive ? "page" : undefined}
            className={`font-mono text-[10px] uppercase tracking-[0.14em] flex items-center gap-1.5 ${
              isActive ? "text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {p.label}
            {showBadge && (
              <span className="font-mono text-[9px] bg-warm text-bg rounded-sm px-1.5 py-0.5 leading-none">
                {pending}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
