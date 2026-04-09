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
  format: "Lincoln-Douglas" | "Public Forum" | "Policy" | "Async";
  skillLevel: "Novice" | "Intermediate" | "Advanced";
  requestedBy: string;
  preferredSide: "Aff" | "Neg" | "Either";
  status: "Open" | "Matched" | "Closed";
  createdAt: string;
  rounds?: number;
  responseWindowHours?: number;
  requesterSideLabel?: string;
  requesterGoal?: string;
}

export interface DebateParticipant {
  name: string;
  side: "Aff" | "Neg";
  label: string;
  partnerLabel?: string;
}

export interface DebateTurn {
  id: string;
  code?: string;
  title?: string;
  author: string;
  side: "Aff" | "Neg";
  submittedAt?: string;
  summary: string;
  durationLabel?: string;
  status: "submitted" | "current" | "locked";
  actionLabel?: string;
}

export interface DebateThread {
  id: string;
  topic: string;
  format: string;
  status: "Waiting on You" | "Waiting on Opponent" | "Completed";
  lane: "my-debates" | "completed" | "spectate";
  partnerName: string;
  nextDeadline: string;
  affirmative: DebateParticipant;
  negative: DebateParticipant;
  currentRound: number;
  totalRounds: number;
  spectators: number;
  aiJudged?: boolean;
  winner?: "Aff" | "Neg";
  score?: {
    aff: number;
    neg: number;
  };
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
  shortCode?: string;
  category?: "Tournament" | "School" | "Debate Type" | "Practice Group";
  memberCount?: number;
  activityLabel?: string;
  accent?: "sage" | "gold" | "terracotta" | "sand";
}

export interface CommunityPost {
  id: string;
  channelId: string;
  author: string;
  authorRole?: string;
  category?: "Question" | "Speech Review" | "Tips & Strategies" | "All Posts";
  debateType?: string;
  title?: string;
  content: string;
  createdAt: string;
  replyCount: number;
  reported: boolean;
  likeCount?: number;
  shareCount?: number;
  attachmentTitle?: string;
  attachmentMeta?: string;
  aiScoreLabel?: string;
  featuredReplyAuthor?: string;
  featuredReplyPreview?: string;
}

export interface EventItem {
  id: string;
  name: string;
  date: string;
  location: string;
  type: "Tournament" | "Scrimmage" | "Workshop";
}
