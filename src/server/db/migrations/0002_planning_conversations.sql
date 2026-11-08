CREATE TABLE "planning_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"create_request_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "planning_customer_create_unique" UNIQUE("customer_id","create_request_id")
);
