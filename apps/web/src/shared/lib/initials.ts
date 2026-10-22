/** Two-letter avatar initials from the given name, without Vietnamese tone marks (Đức becomes ĐU). */
export function initialsOf(fullName: string): string {
  const givenName = fullName.trim().split(/\s+/).pop() ?? "";
  return givenName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 2)
    .toLocaleUpperCase();
}
