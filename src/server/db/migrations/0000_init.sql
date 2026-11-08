CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"plan_revision" integer NOT NULL,
	"action_ids" jsonb NOT NULL,
	"approved_total" bigint NOT NULL,
	"currency" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"action_id" text NOT NULL,
	"approval_id" text NOT NULL,
	"kind" text NOT NULL,
	"execution_key" text NOT NULL,
	"state" text NOT NULL,
	"provider_reference" text,
	"actual_amount" bigint,
	"evidence" jsonb,
	"error_reason" text,
	"mode" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "attempts_execution_key_unique" UNIQUE("execution_key")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"brief" jsonb NOT NULL,
	"brief_revision" integer NOT NULL,
	"status" text NOT NULL,
	"plan_revision" integer DEFAULT 0 NOT NULL,
	"cancel_requested_at" timestamp with time zone,
	"progress_sequence" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"approval_id" text NOT NULL,
	"checkout_session_id" text NOT NULL,
	"payment_intent_id" text,
	"amount" bigint NOT NULL,
	"currency" text NOT NULL,
	"state" text NOT NULL,
	"refund_id" text,
	"refund_state" text DEFAULT 'none' NOT NULL,
	"refund_reason" text,
	"mode" text NOT NULL,
	CONSTRAINT "payments_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "payments_checkout_session_id_unique" UNIQUE("checkout_session_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"revision" integer NOT NULL,
	"brief_revision" integer NOT NULL,
	"run_id" text NOT NULL,
	"dropped" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "plans_event_revision_unique" UNIQUE("event_id","revision")
);
--> statement-breakpoint
CREATE TABLE "progress_entries" (
	"event_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"actor" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "progress_entries_pkey" PRIMARY KEY("event_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "research_results" (
	"run_id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"brief_revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"superseded" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"phase" text NOT NULL,
	"brief_revision" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"naive_session_id" text,
	"last_sequence" integer DEFAULT 0 NOT NULL,
	"state" text NOT NULL,
	"advancing_until" timestamp with time zone,
	"corrections_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "runs_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "runs_corrections_used_check" CHECK ("runs"."corrections_used" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_entries" ADD CONSTRAINT "progress_entries_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_results" ADD CONSTRAINT "research_results_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;