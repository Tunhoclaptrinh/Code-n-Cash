/**
 * User guide, one Markdown file per topic and language (src/guide/<lang>/<topic>.md). The files
 * point at screenshots in public/guide/images, so they read the same on GitHub and in the app.
 */
export const GUIDE_TOPICS = [
  "start",
  "roles",
  "tables",
  "tasks",
  "contracts",
  "decision",
  "evidence",
  "approval",
  "dispute",
  "signing",
  "exceptions",
  "integrity",
  "activity",
  "data",
  "admin",
] as const;

export type GuideTopic = (typeof GUIDE_TOPICS)[number];

const sources = import.meta.glob<string>("./*/*.md", {
  query: "?raw",
  import: "default",
});

export const isGuideTopic = (value: string | undefined): value is GuideTopic =>
  GUIDE_TOPICS.includes(value as GuideTopic);

/** The topic in the user's language, falling back to Vietnamese. */
export async function loadGuide(
  topic: GuideTopic,
  language: string,
): Promise<string> {
  const code = language.startsWith("en") ? "en" : "vi";
  const load = sources[`./${code}/${topic}.md`] ?? sources[`./vi/${topic}.md`];
  return load ? load() : "";
}
