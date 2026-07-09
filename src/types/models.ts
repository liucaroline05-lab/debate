export type UserRole = "student" | "coach";

export interface UserPreferences {
  notifications: {
    speechFeedback: boolean;
    debateTurnReminders: boolean;
    communityReplies: boolean;
    tournamentReminders: boolean;
  };
  debateDefaults: {
    preferredFormat: "Policy" | "Lincoln-Douglas" | "Public Forum" | "Congress" | "Extemp";
    preferredSide: "Aff" | "Neg" | "Either";
    asyncResponseCadence: "12 hours" | "24 hours" | "48 hours";
  };
}

export interface UserProfile {
  id: string;
  displayName: string;
  username?: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  avatarStoragePath?: string;
  bio: string;
  focusAreas: string[];
  organizationTags: string[];
  recommendationSlots: string[];
  preferences: UserPreferences;
  followersCount?: number;
  followingCount?: number;
  activeChannelIds?: string[];
  tabroomProfileUrl?: string;
  createdAt: string;
}

export interface SpeechRecord {
  id: string;
  creatorId?: string;
  title: string;
  eventName: string;
  format: "Policy" | "Lincoln-Douglas" | "Public Forum" | "Congress" | "Extemp";
  visibility?: "private" | "public";
  status: "Uploaded" | "Reviewing" | "Ready for Feedback";
  speakerName: string;
  coachNotes: string;
  uploadedAt: string;
  transcriptStatus: "Pending" | "Generated" | "Needs Review";
  tags: string[];
  organizationTags: string[];
  mediaPath?: string;
  reported?: boolean;
}

export interface DebateMatchRequest {
  id: string;
  topic: string;
  format: "Lincoln-Douglas" | "Public Forum" | "Policy" | "Async";
  skillLevel: "Novice" | "Intermediate" | "Advanced";
  requestedBy: string;
  creatorId?: string;
  preferredSide: "Aff" | "Neg" | "Either";
  status: "Open" | "Matched" | "Closed";
  createdAt: string;
  rounds?: number;
  responseWindowHours?: number;
  requesterSideLabel?: string;
  requesterGoal?: string;
  visibility?: "public" | "private";
  commentsEnabled?: boolean;
  speechTimeLimit?: string;
}

export interface DebateParticipant {
  name: string;
  side: "Aff" | "Neg";
  label: string;
  partnerLabel?: string;
  userId?: string;
}

export interface DebateTurn {
  id: string;
  code?: string;
  title?: string;
  author: string;
  authorId?: string;
  side: "Aff" | "Neg";
  submittedAt?: string;
  summary: string;
  durationLabel?: string;
  status: "submitted" | "current" | "locked";
  actionLabel?: string;
  speechUrl?: string;
}

export type DebateStatus =
  | "Awaiting Opponent"
  | "Active"
  | "Waiting on You"
  | "Waiting on Opponent"
  | "Completed";

export interface DebateThread {
  id: string;
  topic: string;
  format: string;
  status: DebateStatus;
  /** Legacy static section marker; sections are now derived from the viewer. */
  lane?: "my-debates" | "completed" | "spectate";
  visibility?: "public" | "private";
  inviteCode?: string;
  creatorId?: string;
  currentTurnUserId?: string | null;
  commentsEnabled?: boolean;
  commentCount?: number;
  likeCount?: number;
  dislikeCount?: number;
  favoriteCount?: number;
  shareCount?: number;
  speechTimeLimit?: string;
  partnerName?: string;
  nextDeadline: string;
  affirmative: DebateParticipant;
  negative: DebateParticipant;
  currentRound: number;
  totalRounds: number;
  spectators: number;
  aiJudged?: boolean;
  winner?: "Aff" | "Neg";
  participantIds?: string[];
  watchPath?: string;
  summary?: string;
  score?: {
    aff: number;
    neg: number;
  };
  turns: DebateTurn[];
  debatePartnerSuggestions?: string[];
}

export interface DebateMessage {
  id: string;
  debateId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface DebateComment {
  id: string;
  debateId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface DebateReaction {
  id: string;
  debateId: string;
  userId: string;
  like: boolean;
  dislike: boolean;
  favorite: boolean;
  createdAt: string;
}

export interface ResourceItem {
  id: string;
  slug?: string;
  title: string;
  category: "Case Building" | "Rebuttal" | "Research" | "Delivery";
  description: string;
  curatedBy: string;
  creatorId?: string;
  creatorRole?: UserRole;
  saved: boolean;
  level: "Starter" | "Growth" | "Advanced";
  format?: "Policy" | "Lincoln-Douglas" | "Public Forum" | "Congress" | "Extemp" | "All Formats";
  mediaType?: "Article" | "Audio" | "Video" | "Link" | "Worksheet";
  mediaPath?: string;
  externalUrl?: string;
  thumbnailUrl?: string;
  tags: string[];
  contentSections?: Array<{
    title: string;
    body: string;
  }>;
  estimatedTime?: string;
  createdAt?: string;
  updatedAt?: string;
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
  authorId: string;
  author: string;
  authorRole?: string;
  category?: "Question" | "Speech Review" | "Tips & Strategies" | "All Posts";
  debateType?: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  replyCount: number;
  reported: boolean;
  likeCount?: number;
  dislikeCount?: number;
  favoriteCount?: number;
  shareCount?: number;
  attachmentTitle?: string;
  attachmentMeta?: string;
  aiScoreLabel?: string;
  featuredReplyAuthor?: string;
  featuredReplyPreview?: string;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface PostReaction {
  id: string;
  postId: string;
  userId: string;
  like: boolean;
  dislike: boolean;
  favorite: boolean;
  createdAt: string;
}

export interface FollowRelation {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
}

export interface ChannelMembership {
  id: string;
  channelId: string;
  userId: string;
  role?: "Member" | "Coach" | "Moderator";
  lastActiveAt?: string;
}

export interface PerformancePoint {
  label: string;
  score: number;
  wins?: number;
  losses?: number;
}

export interface RadarPoint {
  skill: string;
  value: number;
}

export interface UserStats {
  id: string;
  userId: string;
  wins: number;
  losses: number;
  averageScore: number;
  winRate: number;
  totalRounds: number;
  performanceOverTime: PerformancePoint[];
  formatBreakdown: PerformancePoint[];
  topicStrengths: RadarPoint[];
}

export interface TabroomLink {
  id: string;
  userId: string;
  profileUrl: string;
  handle: string;
  status: "linked" | "syncing" | "error" | "unlinked";
  lastSyncedAt?: string;
}

export interface TabroomEvent {
  id: string;
  name: string;
  date: string;
  result: string;
  sourceUrl: string;
}

export interface TabroomImport {
  id: string;
  userId: string;
  status: "queued" | "syncing" | "success" | "error";
  startedAt: string;
  lastSuccessfulAt?: string;
  errorMessage?: string;
  events: TabroomEvent[];
}

export interface EventItem {
  id: string;
  name: string;
  date: string;
  location: string;
  type: "Tournament" | "Scrimmage" | "Workshop";
}
