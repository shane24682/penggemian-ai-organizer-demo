CREATE TYPE "public"."checkin_method" AS ENUM('SELF_CONFIRM');--> statement-breakpoint
CREATE TYPE "public"."checkin_status" AS ENUM('PRESENT', 'LATE', 'ABSENT');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('QUEUED', 'PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TYPE "public"."regroup_intent_status" AS ENUM('OPEN', 'MATCHED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."session_member_status" AS ENUM('CONFIRMED', 'WITHDRAWN', 'COMPLETED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."session_member_type" AS ENUM('HOST', 'PARTICIPANT');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('FORMING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "checkin_status" NOT NULL,
	"method" "checkin_method" DEFAULT 'SELF_CONFIRM' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkins_session_user_unique" UNIQUE("session_id","user_id"),
	CONSTRAINT "checkins_timestamp_by_status" CHECK (("checkins"."status" = 'ABSENT' AND "checkins"."checked_in_at" IS NULL) OR ("checkins"."status" IN ('PRESENT', 'LATE') AND "checkins"."checked_in_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"request_id" uuid,
	"session_id" uuid,
	"cost_type" varchar(96) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'CNY' NOT NULL,
	"note" varchar(1000),
	"incurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_items_amount_nonnegative" CHECK ("cost_items"."amount_cents" >= 0),
	CONSTRAINT "cost_items_currency_cny" CHECK ("cost_items"."currency" = 'CNY'),
	CONSTRAINT "cost_items_has_aggregate" CHECK ("cost_items"."request_id" IS NOT NULL OR "cost_items"."session_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"event_type" varchar(96) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"request_id" uuid,
	"session_id" uuid,
	"data_scope" "data_scope" NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" varchar(160) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"match_candidate_id" uuid NOT NULL,
	"invitee_user_id" uuid NOT NULL,
	"role_slot_id" uuid NOT NULL,
	"status" "invitation_status" NOT NULL,
	"queue_position" integer NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_match_candidate_unique" UNIQUE("match_candidate_id"),
	CONSTRAINT "invitations_queue_position_nonnegative" CHECK ("invitations"."queue_position" >= 0),
	CONSTRAINT "invitations_valid_expiry" CHECK (("invitations"."sent_at" IS NULL AND "invitations"."expires_at" IS NULL) OR ("invitations"."sent_at" IS NOT NULL AND "invitations"."expires_at" > "invitations"."sent_at")),
	CONSTRAINT "invitations_valid_response_time" CHECK ("invitations"."responded_at" IS NULL OR ("invitations"."sent_at" IS NOT NULL AND "invitations"."responded_at" >= "invitations"."sent_at"))
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"channel" "notification_channel" DEFAULT 'IN_APP' NOT NULL,
	"template_code" varchar(96) NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_status" DEFAULT 'QUEUED' NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"idempotency_key" varchar(128) NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "notification_outbox_attempt_count_range" CHECK ("notification_outbox"."attempt_count" BETWEEN 0 AND 3),
	CONSTRAINT "notification_outbox_read_after_sent" CHECK ("notification_outbox"."read_at" IS NULL OR ("notification_outbox"."sent_at" IS NOT NULL AND "notification_outbox"."read_at" >= "notification_outbox"."sent_at"))
);
--> statement-breakpoint
CREATE TABLE "ops_work_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ops_user_id" uuid NOT NULL,
	"request_id" uuid,
	"session_id" uuid,
	"action_type" varchar(96) NOT NULL,
	"minutes_spent" integer NOT NULL,
	"note" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ops_work_logs_minutes_positive" CHECK ("ops_work_logs"."minutes_spent" > 0),
	CONSTRAINT "ops_work_logs_has_aggregate" CHECK ("ops_work_logs"."request_id" IS NOT NULL OR "ops_work_logs"."session_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "regroup_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"willing_user_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "regroup_intent_status" DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regroup_intents_session_user_unique" UNIQUE("session_id","user_id"),
	CONSTRAINT "regroup_intents_willing_users_is_array" CHECK (jsonb_typeof("regroup_intents"."willing_user_ids_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"reviewer_user_id" uuid NOT NULL,
	"reviewee_user_id" uuid NOT NULL,
	"rating" smallint NOT NULL,
	"tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" varchar(1000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_session_reviewer_reviewee_unique" UNIQUE("session_id","reviewer_user_id","reviewee_user_id"),
	CONSTRAINT "reviews_rating_range" CHECK ("reviews"."rating" BETWEEN 1 AND 5),
	CONSTRAINT "reviews_no_self_review" CHECK ("reviews"."reviewer_user_id" <> "reviews"."reviewee_user_id"),
	CONSTRAINT "reviews_tags_is_array" CHECK (jsonb_typeof("reviews"."tags_json") = 'array')
);
--> statement-breakpoint
CREATE TABLE "session_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_slot_id" uuid,
	"member_type" "session_member_type" NOT NULL,
	"member_status" "session_member_status" DEFAULT 'CONFIRMED' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_members_session_user_unique" UNIQUE("session_id","user_id"),
	CONSTRAINT "session_members_role_slot_by_type" CHECK (("session_members"."member_type" = 'HOST' AND "session_members"."role_slot_id" IS NULL) OR ("session_members"."member_type" = 'PARTICIPANT' AND "session_members"."role_slot_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"status" "session_status" DEFAULT 'FORMING' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "sessions_valid_time_range" CHECK ("sessions"."ends_at" > "sessions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" varchar(64) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(96) NOT NULL,
	"actor_user_id" uuid,
	"from_status" varchar(32),
	"to_status" varchar(32) NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_events_status_changed" CHECK ("status_events"."from_status" IS NULL OR "status_events"."from_status" <> "status_events"."to_status")
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cost_items" ADD CONSTRAINT "cost_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_match_candidate_id_match_candidates_id_fk" FOREIGN KEY ("match_candidate_id") REFERENCES "public"."match_candidates"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invitee_user_id_users_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_slot_id_request_role_slots_id_fk" FOREIGN KEY ("role_slot_id") REFERENCES "public"."request_role_slots"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ops_work_logs" ADD CONSTRAINT "ops_work_logs_ops_user_id_users_id_fk" FOREIGN KEY ("ops_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ops_work_logs" ADD CONSTRAINT "ops_work_logs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ops_work_logs" ADD CONSTRAINT "ops_work_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "regroup_intents" ADD CONSTRAINT "regroup_intents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "regroup_intents" ADD CONSTRAINT "regroup_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewee_user_id_users_id_fk" FOREIGN KEY ("reviewee_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_role_slot_id_request_role_slots_id_fk" FOREIGN KEY ("role_slot_id") REFERENCES "public"."request_role_slots"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "checkins_session_status_idx" ON "checkins" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "cost_items_school_incurred_at_idx" ON "cost_items" USING btree ("school_id","incurred_at");--> statement-breakpoint
CREATE INDEX "cost_items_request_incurred_at_idx" ON "cost_items" USING btree ("request_id","incurred_at");--> statement-breakpoint
CREATE INDEX "cost_items_session_incurred_at_idx" ON "cost_items" USING btree ("session_id","incurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_school_event_occurred_at_idx" ON "domain_events" USING btree ("school_id","event_type","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_request_occurred_at_idx" ON "domain_events" USING btree ("request_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_events_session_occurred_at_idx" ON "domain_events" USING btree ("session_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_active_request_user_slot_unique" ON "invitations" USING btree ("request_id","invitee_user_id","role_slot_id") WHERE "invitations"."status" IN ('QUEUED', 'PENDING');--> statement-breakpoint
CREATE INDEX "invitations_invitee_status_created_at_idx" ON "invitations" USING btree ("invitee_user_id","status","created_at" desc);--> statement-breakpoint
CREATE INDEX "invitations_status_expires_at_idx" ON "invitations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "invitations_session_role_status_idx" ON "invitations" USING btree ("session_id","role_slot_id","status");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_available_at_idx" ON "notification_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_recipient_created_at_idx" ON "notification_outbox" USING btree ("recipient_user_id","created_at" desc);--> statement-breakpoint
CREATE INDEX "ops_work_logs_request_created_at_idx" ON "ops_work_logs" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "ops_work_logs_session_created_at_idx" ON "ops_work_logs" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "regroup_intents_session_status_idx" ON "regroup_intents" USING btree ("session_id","status");--> statement-breakpoint
CREATE INDEX "reviews_session_created_at_idx" ON "reviews" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_members_user_status_idx" ON "session_members" USING btree ("user_id","member_status");--> statement-breakpoint
CREATE INDEX "session_members_session_status_idx" ON "session_members" USING btree ("session_id","member_status");--> statement-breakpoint
CREATE INDEX "sessions_school_status_created_at_idx" ON "sessions" USING btree ("school_id","status","created_at" desc);--> statement-breakpoint
CREATE INDEX "status_events_aggregate_created_at_idx" ON "status_events" USING btree ("aggregate_type","aggregate_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "status_events_aggregate_idempotency_unique" ON "status_events" USING btree ("aggregate_type","aggregate_id","idempotency_key") WHERE "status_events"."idempotency_key" IS NOT NULL;