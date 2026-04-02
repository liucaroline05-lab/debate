import type {
  CommunityChannel,
  CommunityPost,
  DebateMatchRequest,
  DebateThread,
  EventItem,
  ResourceItem,
  SpeechRecord,
  UserProfile,
} from "@/types/models";

export const mockUser: UserProfile = {
  id: "demo-user",
  displayName: "Maya Rivera",
  email: "maya@example.com",
  role: "student",
  bio: "Public Forum debater blending research discipline with warm, persuasive delivery.",
  focusAreas: ["Crossfire strategy", "Rebuttal timing", "Speech presence"],
  organizationTags: ["Mountain View Debate", "PF Captain"],
  recommendationSlots: ["Partner suggestions", "Coach next steps"],
  createdAt: "2026-03-20T09:00:00.000Z",
};

export const speeches: SpeechRecord[] = [
  {
    id: "speech-1",
    title: "Climate Adaptation Constructive",
    eventName: "Spring Invitational",
    format: "Public Forum",
    status: "Ready for Feedback",
    speakerName: "Maya Rivera",
    coachNotes: "Strong pacing and framing. Needs cleaner impact collapse.",
    uploadedAt: "2026-03-30T15:20:00.000Z",
    transcriptStatus: "Generated",
    tags: ["Impact calculus", "Case structure"],
    organizationTags: ["partner-match-ready"],
  },
  {
    id: "speech-2",
    title: "Federalism Rebuttal Drill",
    eventName: "Team Lab",
    format: "Lincoln-Douglas",
    status: "Reviewing",
    speakerName: "Maya Rivera",
    coachNotes: "Waiting on coach notes from workshop circle.",
    uploadedAt: "2026-03-28T11:15:00.000Z",
    transcriptStatus: "Pending",
    tags: ["Line-by-line", "Extensions"],
    organizationTags: ["needs-tagging"],
  },
];

export const debateThreads: DebateThread[] = [
  {
    id: "debate-1",
    topic: "Should AI-generated evidence be allowed in student debate?",
    format: "Async PF",
    status: "Waiting on You",
    partnerName: "Jordan Kim",
    nextDeadline: "2026-04-03T17:00:00.000Z",
    debatePartnerSuggestions: ["Jordan Kim", "Taylor Brooks"],
    turns: [
      {
        id: "turn-1",
        author: "Jordan Kim",
        side: "Aff",
        submittedAt: "2026-03-31T18:15:00.000Z",
        summary: "Opens on accessibility and coaching equity concerns.",
      },
    ],
  },
  {
    id: "debate-2",
    topic: "Resolved: local journalism deserves federal support",
    format: "Async LD",
    status: "Waiting on Opponent",
    partnerName: "Ari Patel",
    nextDeadline: "2026-04-02T13:00:00.000Z",
    debatePartnerSuggestions: ["Ari Patel"],
    turns: [
      {
        id: "turn-2",
        author: "Maya Rivera",
        side: "Neg",
        submittedAt: "2026-03-31T08:00:00.000Z",
        summary: "Posts value criterion and solvency skepticism.",
      },
    ],
  },
];

export const matchRequests: DebateMatchRequest[] = [
  {
    id: "match-1",
    topic: "Universal school lunch funding",
    format: "Async",
    skillLevel: "Intermediate",
    requestedBy: "Coach Lila Tran",
    preferredSide: "Either",
    status: "Open",
    createdAt: "2026-03-29T11:30:00.000Z",
  },
  {
    id: "match-2",
    topic: "Nuclear energy expansion",
    format: "Practice Round",
    skillLevel: "Advanced",
    requestedBy: "Noah S.",
    preferredSide: "Aff",
    status: "Matched",
    createdAt: "2026-03-30T10:15:00.000Z",
  },
];

export const resources: ResourceItem[] = [
  {
    id: "resource-1",
    title: "Three-layer rebuttal framework",
    category: "Rebuttal",
    description: "A coach-curated worksheet for grouping warrants, weighing, and crystallization.",
    curatedBy: "Coach Lila Tran",
    saved: true,
    level: "Starter",
    tags: ["Template", "Practice"],
  },
  {
    id: "resource-2",
    title: "Research sprint checklist",
    category: "Research",
    description: "A boho-friendly printable flow for evidence triage, source credibility, and cut-card prep.",
    curatedBy: "Debate Studio",
    saved: false,
    level: "Growth",
    tags: ["Workflow", "Prep"],
  },
  {
    id: "resource-3",
    title: "Delivery reset ritual",
    category: "Delivery",
    description: "Breath, posture, and emphasis prompts for calmer, stronger speeches.",
    curatedBy: "Coach Jonah Price",
    saved: true,
    level: "Advanced",
    tags: ["Confidence", "Warm-up"],
  },
];

export const channels: CommunityChannel[] = [
  {
    id: "channel-1",
    name: "PF Flow Lab",
    summary: "Break down crossfire and summary habits with peers and coaches.",
    followers: 184,
    topicTags: ["Public Forum", "Crossfire", "Feedback"],
  },
  {
    id: "channel-2",
    name: "Coach Corner",
    summary: "Share drills, tournament logistics, and review rubrics.",
    followers: 92,
    topicTags: ["Coaching", "Rubrics", "Team Ops"],
  },
  {
    id: "channel-3",
    name: "Round Reflection",
    summary: "Post lessons from practice rounds and find new debate partners.",
    followers: 131,
    topicTags: ["Reflection", "Async Debate"],
  },
];

export const posts: CommunityPost[] = [
  {
    id: "post-1",
    channelId: "channel-1",
    author: "Coach Lila Tran",
    content: "Try tagging your rebuttal clips by weighing mechanism before you review them.",
    createdAt: "2026-03-31T15:00:00.000Z",
    replyCount: 8,
    reported: false,
  },
  {
    id: "post-2",
    channelId: "channel-3",
    author: "Maya Rivera",
    content: "Looking for an async PF partner to practice climate and labor topics this week.",
    createdAt: "2026-03-31T09:20:00.000Z",
    replyCount: 5,
    reported: false,
  },
];

export const events: EventItem[] = [
  {
    id: "event-1",
    name: "Golden Oak Scrimmage",
    date: "2026-04-05T18:00:00.000Z",
    location: "Remote",
    type: "Scrimmage",
  },
  {
    id: "event-2",
    name: "West Coast Debate Workshop",
    date: "2026-04-11T17:00:00.000Z",
    location: "Oakland, CA",
    type: "Workshop",
  },
];
