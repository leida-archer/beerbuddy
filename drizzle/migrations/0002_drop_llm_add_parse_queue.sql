-- 0002_drop_llm_add_parse_queue.sql
--
-- Omit the LLM circular-parsing capability (2026-05-10). The Anthropic
-- dependency is removed; adapters that hit an un-auto-parseable source
-- now write to manual_parse_queue and notify the admin via the
-- notifyAdmin helper, which the admin handles out-of-band.

DROP TABLE "llm_parse_failures";--> statement-breakpoint
CREATE TABLE "manual_parse_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"kind" text DEFAULT 'manual-parse' NOT NULL,
	"source_url" text,
	"media_type" text,
	"hint" text NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_notes" text
);--> statement-breakpoint
CREATE INDEX "manual_parse_queue_pending_idx" ON "manual_parse_queue" USING btree ("resolved_at");--> statement-breakpoint
CREATE INDEX "manual_parse_queue_source_idx" ON "manual_parse_queue" USING btree ("source_id");
