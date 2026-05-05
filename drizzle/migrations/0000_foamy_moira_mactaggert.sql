CREATE TABLE "llm_parse_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"raw_response" jsonb NOT NULL,
	"zod_errors" jsonb NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"canonical_product_id" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"was_price_cents" integer,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_aliases" (
	"id" serial PRIMARY KEY NOT NULL,
	"chain_sku" text NOT NULL,
	"canonical_product_id" integer NOT NULL,
	"raw_name" text NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_session" text
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"name" text NOT NULL,
	"pack_size" integer NOT NULL,
	"pack_unit_ml" integer NOT NULL,
	"abv" real,
	"style" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quarantine_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" text NOT NULL,
	"raw_product_identifier" text NOT NULL,
	"attempted_price_cents" integer,
	"prior_price_cents" integer,
	"reason" text NOT NULL,
	"raw_snippet" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"products_observed" integer NOT NULL,
	"prices_written" integer NOT NULL,
	"parse_failure_count" integer NOT NULL,
	"fetch_error_count" integer NOT NULL,
	"parse_failures" jsonb,
	"fetch_errors" jsonb
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"zip" text NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"is_indie" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_events" ADD CONSTRAINT "price_events_canonical_product_id_products_id_fk" FOREIGN KEY ("canonical_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_canonical_product_id_products_id_fk" FOREIGN KEY ("canonical_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "price_events_unique_idx" ON "price_events" USING btree ("store_id","canonical_product_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_events_product_observed_idx" ON "price_events" USING btree ("canonical_product_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_events_store_observed_idx" ON "price_events" USING btree ("store_id","observed_at");--> statement-breakpoint
CREATE INDEX "price_events_observed_idx" ON "price_events" USING btree ("observed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "aliases_chain_sku_idx" ON "product_aliases" USING btree ("chain_sku");--> statement-breakpoint
CREATE INDEX "aliases_canonical_idx" ON "product_aliases" USING btree ("canonical_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_brand_name_pack_idx" ON "products" USING btree ("brand","name","pack_size","pack_unit_ml");--> statement-breakpoint
CREATE INDEX "runs_source_started_idx" ON "runs" USING btree ("source_id","started_at");--> statement-breakpoint
CREATE INDEX "stores_chain_idx" ON "stores" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "stores_geo_idx" ON "stores" USING btree ("lat","lon");