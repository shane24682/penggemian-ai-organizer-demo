CREATE TYPE "public"."delivery_attempt_status" AS ENUM('PROCESSING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TABLE "delivery_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outbox_id" uuid NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" "delivery_attempt_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_attempts_outbox_attempt_unique" UNIQUE("outbox_id","attempt_no"),
	CONSTRAINT "delivery_attempts_attempt_no_range" CHECK ("delivery_attempts"."attempt_no" between 1 and 3)
);
--> statement-breakpoint
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_outbox_id_notification_outbox_id_fk" FOREIGN KEY ("outbox_id") REFERENCES "public"."notification_outbox"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "delivery_attempts_outbox_started_at_idx" ON "delivery_attempts" USING btree ("outbox_id","started_at");