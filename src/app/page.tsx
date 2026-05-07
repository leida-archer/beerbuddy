import { asString } from "./deals/url";

export default async function Home(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const rejectedZip = asString(sp.zip);
  const hasError = asString(sp.error) === "region";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16 text-center">
      <div className="font-mono text-[11px] tracking-[0.18em] uppercase text-warm mb-8 font-medium">
        Golden Hour
      </div>

      <h1 className="font-display font-medium text-5xl sm:text-7xl leading-none tracking-tight mb-8">
        BeerBuddy<span className="text-warm">.</span>
      </h1>

      <form action="/deals" method="get" className="w-full max-w-[240px]">
        <label
          htmlFor="zip"
          className="block font-mono text-[10px] tracking-[0.16em] uppercase text-muted mb-2 text-left"
        >
          Enter your ZIP
        </label>
        <div className="flex gap-1.5">
          <input
            id="zip"
            name="zip"
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            required
            defaultValue={rejectedZip ?? ""}
            autoComplete="postal-code"
            className={`flex-1 min-w-0 bg-surface rounded-sm px-3 py-2.5 font-mono text-base text-ink tracking-[0.06em] border ${
              hasError ? "border-error" : "border-ink"
            }`}
          />
          <button
            type="submit"
            className="bg-ink text-bg border border-ink rounded-sm px-4 py-2.5 font-body text-[13px] font-medium leading-none min-h-11"
          >
            →
          </button>
        </div>

        {hasError && <ZipErrorBlock />}
      </form>

      <div className="mt-24 pt-4 border-t border-rule font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        Nevada County, CA · v0
      </div>
    </main>
  );
}

function ZipErrorBlock() {
  return (
    <div className="mt-3 text-left max-w-[240px] mx-auto">
      <div className="font-mono text-[9px] tracking-[0.18em] uppercase text-error font-semibold mb-1">
        Out of area
      </div>
      <p className="text-[12px] text-ink leading-[1.5]">
        BeerBuddy isn&rsquo;t ready in your region yet. We&rsquo;re starting in Nevada County, CA.
      </p>
    </div>
  );
}
