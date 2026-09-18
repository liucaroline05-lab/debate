export const speechTopicCategories = [
  "Arts & Culture",
  "Economics",
  "Education",
  "Environment",
  "Government & Law",
  "Health",
  "Science & Technology",
  "Social Issues",
  "Other",
] as const;

export type SpeechTopicCategory = (typeof speechTopicCategories)[number];
