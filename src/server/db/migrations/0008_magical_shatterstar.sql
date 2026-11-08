CREATE TABLE "arrange_payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"fingerprint" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arrange_payment_events" ADD CONSTRAINT "arrange_payment_events_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;