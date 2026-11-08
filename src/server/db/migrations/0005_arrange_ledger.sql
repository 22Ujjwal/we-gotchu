CREATE TABLE "arrange_events" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"brief" jsonb NOT NULL,
	"contact_consent" boolean NOT NULL,
	"session_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arrange_mail_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"operation_key" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"reply_to_message_id" text,
	"state" text NOT NULL,
	"fingerprint" text,
	"idempotency_key" text,
	"inbox_id" text,
	"message_id" text,
	"thread_id" text,
	"reject_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arrange_mail_operations_key_unique" UNIQUE("event_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE "arrange_mail_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"key" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"inbox_id" text NOT NULL,
	"message_id" text NOT NULL,
	"raw_body" text NOT NULL,
	"evidence_mode" text NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"reply" jsonb,
	"completed" boolean DEFAULT false NOT NULL,
	"lease_token" text,
	"lease_until" timestamp with time zone,
	"outcome" jsonb,
	"event_id" text,
	"contact_id" text,
	"operation_id" text,
	"delivery_state" text,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "arrange_mail_receipts_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "arrange_supplier_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "arrange_contacts_event_email_unique" UNIQUE("event_id","email")
);
--> statement-breakpoint
CREATE TABLE "arrange_supplier_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"receipt_id" text NOT NULL,
	"term" text NOT NULL,
	"amount_minor" bigint,
	"currency" text,
	"note" text,
	"excerpt" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arrange_updates" (
	"id" text PRIMARY KEY NOT NULL,
	"seq" bigserial NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arrange_mail_operations" ADD CONSTRAINT "arrange_mail_operations_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_mail_operations" ADD CONSTRAINT "arrange_mail_operations_contact_id_arrange_supplier_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."arrange_supplier_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_mail_receipts" ADD CONSTRAINT "arrange_mail_receipts_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_mail_receipts" ADD CONSTRAINT "arrange_mail_receipts_contact_id_arrange_supplier_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."arrange_supplier_contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_mail_receipts" ADD CONSTRAINT "arrange_mail_receipts_operation_id_arrange_mail_operations_id_fk" FOREIGN KEY ("operation_id") REFERENCES "public"."arrange_mail_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_supplier_contacts" ADD CONSTRAINT "arrange_supplier_contacts_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_supplier_terms" ADD CONSTRAINT "arrange_supplier_terms_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_supplier_terms" ADD CONSTRAINT "arrange_supplier_terms_receipt_id_arrange_mail_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."arrange_mail_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arrange_updates" ADD CONSTRAINT "arrange_updates_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arrange_events_customer_idx" ON "arrange_events" USING btree ("customer_id");