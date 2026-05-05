export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-warm mb-6 font-medium">
        Golden Hour
      </div>

      <h1 className="font-display font-medium text-5xl sm:text-7xl leading-none tracking-tight mb-6">
        BeerBuddy<span className="text-warm">.</span>
      </h1>

      <p className="text-muted max-w-md text-base leading-relaxed">
        Best beer deals in Nevada County, CA — ranked by what&rsquo;s actually
        on sale this week, not just what&rsquo;s cheapest.
      </p>

      <a
        href="/deals"
        className="mt-12 inline-block font-body text-[15px] font-medium text-bg bg-ink border border-ink rounded-sm px-6 py-3 min-h-11 leading-none transition-colors duration-micro ease-settle hover:bg-[#2A1F14]"
      >
        See this week&rsquo;s deals →
      </a>

      <div className="mt-24 pt-4 border-t border-rule font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        v0 · 2026-05-05
      </div>
    </main>
  );
}
