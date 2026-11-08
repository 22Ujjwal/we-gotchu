CREATE TABLE "supplier_mail_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "request_id" text NOT NULL UNIQUE,
  "data" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_mail_receipts" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "data" jsonb NOT NULL,
  "completed" boolean DEFAULT false NOT NULL,
  "lease_token" text,
  "lease_until" timestamp with time zone,
  "outcome" jsonb,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
