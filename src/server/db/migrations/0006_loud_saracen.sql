CREATE TABLE "arrange_commerce" (
	"event_id" text PRIMARY KEY NOT NULL,
	"facts" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arrange_commerce" ADD CONSTRAINT "arrange_commerce_event_id_arrange_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."arrange_events"("id") ON DELETE no action ON UPDATE no action;