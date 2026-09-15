import { pgEnum } from "drizzle-orm/pg-core";

export const schoolStatusEnum = pgEnum("school_status", ["ACTIVE", "DISABLED"]);
export const userRoleEnum = pgEnum("user_role", ["USER", "OPS", "ADMIN"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "DELETED"]);
export const capabilityRoleEnum = pgEnum("capability_role", ["MODELING", "CODING", "WRITING", "OPEN"]);
export const verificationStatusEnum = pgEnum("verification_status", ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]);
export const requestSceneEnum = pgEnum("request_scene", ["MATH_MODELING"]);
export const requestStatusEnum = pgEnum("request_status", [
  "DRAFT",
  "OPEN",
  "MATCHING",
  "INVITING",
  "FULFILLED",
  "CANCELLED",
  "EXPIRED",
]);
export const dataScopeEnum = pgEnum("data_scope", ["REAL", "TEST", "DEMO"]);
export const matchRunStatusEnum = pgEnum("match_run_status", ["RUNNING", "SUCCEEDED", "FAILED"]);
export const matchCandidateTypeEnum = pgEnum("match_candidate_type", ["PRIMARY", "BACKUP"]);
export const matchCandidateStatusEnum = pgEnum("match_candidate_status", [
  "RANKED",
  "INVITED",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "SKIPPED",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "FORMING",
  "CONFIRMED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);
export const sessionMemberTypeEnum = pgEnum("session_member_type", ["HOST", "PARTICIPANT"]);
export const sessionMemberStatusEnum = pgEnum("session_member_status", [
  "CONFIRMED",
  "WITHDRAWN",
  "COMPLETED",
  "NO_SHOW",
]);
export const invitationStatusEnum = pgEnum("invitation_status", [
  "QUEUED",
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "EXPIRED",
  "CANCELLED",
]);
export const checkinStatusEnum = pgEnum("checkin_status", ["PRESENT", "LATE", "ABSENT"]);
export const checkinMethodEnum = pgEnum("checkin_method", ["SELF_CONFIRM"]);
export const regroupIntentStatusEnum = pgEnum("regroup_intent_status", ["OPEN", "MATCHED", "CLOSED"]);
export const notificationChannelEnum = pgEnum("notification_channel", ["IN_APP"]);
export const notificationStatusEnum = pgEnum("notification_status", [
  "QUEUED",
  "PROCESSING",
  "SENT",
  "FAILED",
  "DEAD",
]);
