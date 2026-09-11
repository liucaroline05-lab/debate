/**
 * Formats offered when uploading a recording. The library covers speech events
 * as well as debate, so the list is grouped for the picker rather than being a
 * flat set of debate formats.
 */
export const speechFormatGroups = [
  {
    label: "Debate",
    formats: [
      "Policy",
      "Lincoln-Douglas",
      "Public Forum",
      "Congress",
      "Parliamentary",
      "World Schools",
      "Big Questions",
    ],
  },
  {
    label: "Speech",
    formats: [
      "Extemp",
      "Original Oratory",
      "Informative Speaking",
      "Declamation",
      "Impromptu",
      "Expository",
    ],
  },
  {
    label: "Interpretation",
    formats: [
      "Dramatic Interpretation",
      "Humorous Interpretation",
      "Duo Interpretation",
      "Program Oral Interpretation",
      "Prose",
      "Poetry",
    ],
  },
  {
    label: "Other",
    formats: ["Other"],
  },
] as const;

export type SpeechFormat =
  (typeof speechFormatGroups)[number]["formats"][number];

export const speechFormats = speechFormatGroups.flatMap(
  (group) => group.formats as readonly SpeechFormat[],
);

export const defaultSpeechFormat: SpeechFormat = "Public Forum";

export const isSpeechFormat = (value: unknown): value is SpeechFormat =>
  typeof value === "string" && (speechFormats as string[]).includes(value);
