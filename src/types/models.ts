export type UserRole = "student" | "coach";

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  bio: string;
  focusAreas: string[];
  organizationTags: string[];
  recommendationSlots: string[];
  createdAt: string;
}

export interface SpeechRecord {
  id: string;
  title: string;
  eventName: string;
  format: "Policy" | "Lincoln-Douglas" | "Public Forum" | "Congress" | "Extemp";
  status: "Uploaded" | "Reviewing" | "Ready for Feedback";
  speakerName: string;
  coachNotes: string;
  uploadedAt: string;
  transcriptStatus: "Pending" | "Generated" | "Needs Review";
  tags: string[];
  organizationTags: string[];
  mediaPath?: string;
}

export interface DebateMatchRequest {
  id: string;
  topic: string;
  format: "Async" | "Practice Round";
  skillLevel: "Novice" | "Intermediate" | "Advanced";
  requestedBy: string;
  preferredSide: "Aff" | "Neg" | "Either";
  status: "Open" | "Matched" | "Closed";
  createdAt: string;
}

export interface DebateTurn {
  id: string;
  author: string;
  side: "Aff" | "Neg";
  submittedAt: string;
  summary: string;
}

export interface DebateThread {
  id: string;
  topic: string;
  format: string;
  status: "Waiting on You" | "Waiting on Opponent" | "Completed";
  partnerName: string;
  nextDeadline: string;
  turns: DebateTurn[];
  debatePartnerSuggestions: string[];
}

export interface ResourceItem {
  id: string;
  title: string;
  category: "Case Building" | "Rebuttal" | "Research" | "Delivery";
  description: string;
  curatedBy: string;
  saved: boolean;
  level: "Starter" | "Growth" | "Advanced";
  tags: string[];
}

export interface CommunityChannel {
  id: string;
  name: string;
  summary: string;
  followers: number;
  topicTags: string[];
}

export interface CommunityPost {
  id: string;
  channelId: string;
  author: string;
  content: string;
  createdAt: string;
  replyCount: number;
  reported: boolean;
}

export interface EventItem {
  id: string;
  name: string;
  date: string;
  location: string;
  type: "Tournament" | "Scrimmage" | "Workshop";
}
