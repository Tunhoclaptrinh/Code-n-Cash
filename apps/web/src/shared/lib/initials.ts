/** Two-letter avatar initials from the given name, without Vietnamese tone marks (Đức becomes ĐU). */
export function initialsOf(fullName: string): string {
  const givenName = fullName.trim().split(/\s+/).pop() ?? "";
  return givenName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 2)
    .toLocaleUpperCase();
}

/** Legal forms and filler words that say nothing about which organisation it is. */
const ORGANIZATION_NOISE = new Set(
  "jsc co ltd llc corp corporation company inc plc group cong ty tnhh cp co phan".split(
    " ",
  ),
);

/**
 * Initials of an organisation from its distinctive words: "Nova An Business JSC" becomes NA,
 * not JS from the legal form at the end.
 */
export function organizationInitials(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "D")
    .split(/[\s.,-]+/)
    .filter((word) => word && !ORGANIZATION_NOISE.has(word.toLowerCase()));
  return (words.length ? words : [name])
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase();
}
