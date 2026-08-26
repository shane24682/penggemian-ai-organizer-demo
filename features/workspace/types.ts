import type { ParticipantFeedback } from "@/components/PostActivity";
import type { ScoredCandidate } from "@/lib/matching";

export type Step = 1 | 2 | 3 | 4;

export type View =
  | "home"
  | "match"
  | "plaza"
  | "quiz"
  | "friends"
  | "history"
  | "partners"
  | "business"
  | "profile"
  | "friendCode"
  | "security"
  | "verification"
  | "tags"
  | "review";

export type Scene = "offline" | "online" | "study";

export type Activity = {
  name: string;
  category: string;
  group: string;
  icon: string;
  note: string;
  meta: string;
  featured: boolean;
  scene?: Scene;
  aliases?: string[];
};

export type VerificationStatus = "unverified" | "reviewing" | "verified";

export type HistoryRecord = {
  id: string;
  activity: string;
  scene?: Scene;
  time: string;
  venue: string;
  venueFeePerPerson: number;
  aiServiceFee: number;
  totalPerPerson: number;
  equipmentNote: string;
  participants?: ScoredCandidate[];
  participantFeedback?: Record<string, ParticipantFeedback>;
  activityRating?: number;
  price?: number;
  createdAt: string;
  status: "已成局" | "已完成";
  calendarAdded?: boolean;
};
