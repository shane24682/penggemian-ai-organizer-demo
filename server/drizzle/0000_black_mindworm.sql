CREATE TYPE "public"."capability_role" AS ENUM('MODELING', 'CODING', 'WRITING', 'OPEN');--> statement-breakpoint
CREATE TYPE "public"."data_scope" AS ENUM('REAL', 'TEST', 'DEMO');--> statement-breakpoint
CREATE TYPE "public"."match_candidate_status" AS ENUM('RANKED', 'INVITED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."match_candidate_type" AS ENUM('PRIMARY', 'BACKUP');--> statement-breakpoint
CREATE TYPE "public"."match_run_status" AS ENUM('RUNNING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."request_scene" AS ENUM('MATH_MODELING');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('DRAFT', 'OPEN', 'MATCHING', 'INVITING', 'FULFILLED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."school_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'OPS', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "idempotency_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"route_key" varchar(128) NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"request_hash" varchar(128) NOT NULL,
	"response_status" integer,
	"response_json" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"status" "school_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_availability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_availability_time_check" CHECK ("user_availability"."ends_at" > "user_availability"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "user_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_code" "capability_role" NOT NULL,
	"level" smallint NOT NULL,
	"summary" varchar(300),
	"verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_capabilities_level_check" CHECK ("user_capabilities"."level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"avatar_url" text,
	"major_category" varchar(64) NOT NULL,
	"grade_year" smallint NOT NULL,
	"bio" varchar(500),
	"competition_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"weekly_hours" smallint DEFAULT 0 NOT NULL,
	"trust_score" smallint DEFAULT 80 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_grade_year_check" CHECK ("user_profiles"."grade_year" between 1 and 8),
	CONSTRAINT "user_profiles_weekly_hours_check" CHECK ("user_profiles"."weekly_hours" between 0 and 80),
	CONSTRAINT "user_profiles_trust_score_check" CHECK ("user_profiles"."trust_score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"phone_e164" varchar(32) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'USER' NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"capability_id" uuid,
	"verification_type" varchar(64) NOT NULL,
	"evidence_url" text NOT NULL,
	"status" "verification_status" DEFAULT 'PENDING' NOT NULL,
	"reviewer_user_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_run_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_slot_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"candidate_type" "match_candidate_type" NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"breakdown_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"candidate_status" "match_candidate_status" DEFAULT 'RANKED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_candidates_rank_check" CHECK ("match_candidates"."rank" > 0),
	CONSTRAINT "match_candidates_score_check" CHECK ("match_candidates"."score" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "match_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"algorithm_version" text NOT NULL,
	"status" "match_run_status" DEFAULT 'RUNNING' NOT NULL,
	"parameters_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"candidate_count" integer DEFAULT 0 NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_code" text,
	"error_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_role_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"role_code" "capability_role" NOT NULL,
	"slot_count" smallint NOT NULL,
	"min_level" smallint NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_role_slots_count_check" CHECK ("request_role_slots"."slot_count" between 1 and 2),
	CONSTRAINT "request_role_slots_level_check" CHECK ("request_role_slots"."min_level" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"creator_user_id" uuid NOT NULL,
	"scene_code" "request_scene" DEFAULT 'MATH_MODELING' NOT NULL,
	"competition_name" varchar(128) NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" varchar(1000),
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"weekly_hours_required" smallint DEFAULT 0 NOT NULL,
	"participant_limit" smallint DEFAULT 3 NOT NULL,
	"application_deadline" timestamp with time zone NOT NULL,
	"status" "request_status" DEFAULT 'OPEN' NOT NULL,
	"source_channel" varchar(64) DEFAULT 'DIRECT' NOT NULL,
	"source_session_id" uuid,
	"data_scope" "data_scope" DEFAULT 'REAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "requests_time_check" CHECK ("requests"."ends_at" > "requests"."starts_at"),
	CONSTRAINT "requests_deadline_check" CHECK ("requests"."application_deadline" <= "requests"."starts_at"),
	CONSTRAINT "requests_weekly_hours_check" CHECK ("requests"."weekly_hours_required" between 0 and 80),
	CONSTRAINT "requests_participant_limit_check" CHECK ("requests"."participant_limit" between 2 and 3)
);
--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_availability" ADD CONSTRAINT "user_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_capability_id_user_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."user_capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_reviewer_user_id_users_id_fk" FOREIGN KEY ("reviewer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_match_run_id_match_runs_id_fk" FOREIGN KEY ("match_run_id") REFERENCES "public"."match_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_candidates" ADD CONSTRAINT "match_candidates_role_slot_id_request_role_slots_id_fk" FOREIGN KEY ("role_slot_id") REFERENCES "public"."request_role_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_runs" ADD CONSTRAINT "match_runs_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_role_slots" ADD CONSTRAINT "request_role_slots_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_records_key_unique" ON "idempotency_records" USING btree ("user_id","route_key","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "schools_code_unique" ON "schools" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "schools_name_unique" ON "schools" USING btree ("name");--> statement-breakpoint
CREATE INDEX "user_availability_time_idx" ON "user_availability" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "user_availability_user_idx" ON "user_availability" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_capabilities_user_role_unique" ON "user_capabilities" USING btree ("user_id","role_code");--> statement-breakpoint
CREATE INDEX "user_capabilities_lookup_idx" ON "user_capabilities" USING btree ("role_code","level","verification_status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_e164_unique" ON "users" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "users_school_status_idx" ON "users" USING btree ("school_id","status");--> statement-breakpoint
CREATE INDEX "verification_records_user_status_idx" ON "verification_records" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_candidates_run_user_unique" ON "match_candidates" USING btree ("match_run_id","user_id");--> statement-breakpoint
CREATE INDEX "match_candidates_run_rank_idx" ON "match_candidates" USING btree ("match_run_id","rank");--> statement-breakpoint
CREATE INDEX "match_candidates_request_user_idx" ON "match_candidates" USING btree ("request_id","user_id");--> statement-breakpoint
CREATE INDEX "match_runs_request_created_idx" ON "match_runs" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "match_runs_current_request_unique" ON "match_runs" USING btree ("request_id") WHERE "match_runs"."is_current" = true and "match_runs"."status" = 'SUCCEEDED';--> statement-breakpoint
CREATE UNIQUE INDEX "request_role_slots_request_role_unique" ON "request_role_slots" USING btree ("request_id","role_code");--> statement-breakpoint
CREATE INDEX "requests_school_status_created_idx" ON "requests" USING btree ("school_id","status","created_at");--> statement-breakpoint
CREATE INDEX "requests_creator_created_idx" ON "requests" USING btree ("creator_user_id","created_at");