// Pure entry-status decision for Tabroom tournaments, kept separate from the
// Cloud Function exports so it can be exercised against real field reports.

export type TabroomEntryStatus = "registered" | "waitlisted" | "dropped";

const asRecord = (value: unknown) =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const asOptionalString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizePersonName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const fieldEntryStudentNames = (entry: Record<string, unknown>) =>
  (Array.isArray(entry.Students) ? entry.Students : [])
    .map(asRecord)
    .map((student) => normalizePersonName(`${asOptionalString(student.first)} ${asOptionalString(student.last)}`))
    .filter(Boolean);

const isWaitlistShown = (field: Record<string, unknown>) => {
  const setting = asRecord(field.settings).fieldWaitlist;
  return Boolean(setting) && setting !== "0";
};

/**
 * Decides an entry status from a tournament's published field reports.
 * Entries are matched by the IDs Tabroom lists for the user and, because
 * waitlisted entries are left out of that list, by the user's name. A
 * tournament only counts as dropped on positive evidence: a matched entry
 * that is neither active nor waitlisted, or no presence at all while every
 * event publishes its waitlist and the user appears in none of them.
 */
export const resolveTabroomEntryStatus = (input: {
  fields: Record<string, unknown>[];
  entryIds: Set<number>;
  personName: string;
  hasAnyPresence: boolean;
}): TabroomEntryStatus | null => {
  const name = normalizePersonName(input.personName);
  const entries = input.fields
    .flatMap((field) => Array.isArray(field.Entries) ? field.Entries : [])
    .map(asRecord);
  const matched = entries.filter((entry) =>
    input.entryIds.has(Number(entry.id)) || (name !== "" && fieldEntryStudentNames(entry).includes(name)));

  if (matched.some((entry) => Number(entry.active) === 1 && Number(entry.waitlist) !== 1)) return "registered";
  if (matched.some((entry) => Number(entry.waitlist) === 1)) return "waitlisted";
  if (matched.length) return "dropped";

  const everyFieldComplete = input.fields.length > 0
    && input.fields.every((field) => Array.isArray(field.Entries) && isWaitlistShown(field));
  return !input.hasAnyPresence && name !== "" && everyFieldComplete ? "dropped" : null;
};

