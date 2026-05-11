/**
 * /admin/indie — indie-store price entry form.
 *
 * Password-gated developer tool (Zero User Labor § "admin-only,
 * never linked publicly"). Lets the developer record manually-
 * observed prices from indie liquor stores that don't ship a
 * scrapeable website. Same `?key=ADMIN_PASSWORD` gate as
 * /admin/aliases.
 *
 * Submit flow: server action validates → upserts store →
 * resolves alias → writes price_event. Returns to this page with
 * a success or error message.
 */

import { redirect } from "next/navigation";

import { AdminNav } from "../_components/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminIndiePage(props: {
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

  const submittedParam = asString(sp.ok);
  const errorParam = asString(sp.err);

  async function submitIndiePrice(formData: FormData): Promise<void> {
    "use server";
    const key = providedKey; // close over the validated key
    try {
      // Lazy import — pulls in @/lib/db. Inside the action so the
      // unauthenticated screen renders even without DATABASE_URL.
      const { db } = await import("@/lib/db");
      const { stores: storesTable } = await import("@/lib/db/schema");
      const { sql } = await import("drizzle-orm");
      const {
        upsertAliasAndCanonicalProduct,
        writePriceEvent,
      } = await import("@/lib/ingest/persist");

      const storeId = readStr(formData, "storeId");
      const storeName = readStr(formData, "storeName");
      const storeAddress = readStr(formData, "storeAddress");
      const storeCity = readStr(formData, "storeCity");
      const storeZip = readStr(formData, "storeZip");
      const storeLat = readNum(formData, "storeLat");
      const storeLon = readNum(formData, "storeLon");

      const productSku = readStr(formData, "productSku");
      const brand = readStr(formData, "brand");
      const productName = readStr(formData, "productName");
      const packCount = readOptNum(formData, "packCount");
      const packUnitMl = readOptNum(formData, "packUnitMl");
      const priceCents = readNum(formData, "priceCents");

      if (!storeId || !productSku || !productName) {
        throw new Error("storeId, productSku, and productName are required");
      }
      if (!Number.isFinite(priceCents) || priceCents <= 0) {
        throw new Error("priceCents must be a positive integer");
      }

      // Upsert the store. Indies always get is_indie=true.
      await db
        .insert(storesTable)
        .values({
          id: storeId,
          chainId: "indie",
          name: storeName || storeId,
          address: storeAddress || "",
          city: storeCity || "",
          zip: storeZip || "",
          lat: storeLat,
          lon: storeLon,
          isIndie: true,
        })
        .onConflictDoUpdate({
          target: storesTable.id,
          set: {
            name: sql`EXCLUDED.name`,
            address: sql`EXCLUDED.address`,
            city: sql`EXCLUDED.city`,
            zip: sql`EXCLUDED.zip`,
            lat: sql`EXCLUDED.lat`,
            lon: sql`EXCLUDED.lon`,
          },
        });

      const resolved = await upsertAliasAndCanonicalProduct({
        chainSku: `indie:${storeId}/${productSku}`,
        brand: brand || null,
        rawName: productName,
        packCount,
        packUnitMl,
      });

      const wrote = await writePriceEvent({
        storeId,
        canonicalProductId: resolved.canonicalProductId,
        priceCents,
        source: "indie-manual",
      });

      redirect(
        `/admin/indie?key=${encodeURIComponent(key)}&ok=${encodeURIComponent(
          `${productName} @ ${storeName || storeId} — ${wrote ? "recorded" : "no-op (same as last price)"}`,
        )}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      redirect(
        `/admin/indie?key=${encodeURIComponent(key)}&err=${encodeURIComponent(msg)}`,
      );
    }
  }

  return (
    <main className="mx-auto max-w-[640px] min-h-screen px-4 py-6">
      <header className="mb-4">
        <h1 className="font-display font-medium text-2xl tracking-tight">
          Indie price entry
        </h1>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mt-1">
          Admin only · manual observation only
        </p>
      </header>

      <AdminNav adminKey={providedKey} active="indie" />

      {submittedParam && (
        <Notice tone="success">{submittedParam}.</Notice>
      )}
      {errorParam && (
        <Notice tone="error">{errorParam}.</Notice>
      )}

      <form action={submitIndiePrice} className="space-y-6">
        <Fieldset legend="Store">
          <Field label="Store ID (slug)" name="storeId" required placeholder="smiths-liquor-grass-valley" />
          <Field label="Store name" name="storeName" placeholder="Smith's Liquor" />
          <Field label="Address" name="storeAddress" placeholder="123 Main St" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="City" name="storeCity" placeholder="Grass Valley" />
            <Field label="ZIP" name="storeZip" placeholder="95945" />
            <Field label="Lat" name="storeLat" inputMode="decimal" placeholder="39.219" />
          </div>
          <Field label="Lon" name="storeLon" inputMode="decimal" placeholder="-121.061" />
        </Fieldset>

        <Fieldset legend="Product + price">
          <Field label="SKU (your label)" name="productSku" required placeholder="sn-pa-12pk-bottles" />
          <Field label="Brand" name="brand" placeholder="Sierra Nevada" />
          <Field label="Product name" name="productName" required placeholder="Pale Ale 12-pack Bottles" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Pack count" name="packCount" inputMode="numeric" placeholder="12" />
            <Field label="Pack mL" name="packUnitMl" inputMode="numeric" placeholder="355" />
            <Field
              label="Price (cents)"
              name="priceCents"
              required
              inputMode="numeric"
              placeholder="1899"
            />
          </div>
        </Fieldset>

        <div className="flex gap-2">
          <button
            type="submit"
            className="font-body text-[14px] font-medium bg-ink text-bg border border-ink rounded-sm px-4 py-2 min-h-11"
          >
            Record observation
          </button>
        </div>
      </form>

      <footer className="mt-10 pt-4 border-t border-rule text-center font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
        Admin only · not linked publicly
      </footer>
    </main>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted mb-2">
        {legend}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
  inputMode,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted block mb-1">
        {label}
        {required && <span className="text-warm ml-1">*</span>}
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full font-mono text-[13px] border border-rule rounded-sm px-3 py-2 min-h-11 focus:outline-none focus:border-ink"
      />
    </label>
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

function readStr(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function readNum(formData: FormData, name: string): number {
  const v = formData.get(name);
  return typeof v === "string" ? Number.parseFloat(v) : Number.NaN;
}

function readOptNum(formData: FormData, name: string): number | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v.trim().length === 0) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}
