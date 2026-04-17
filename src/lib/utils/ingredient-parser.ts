export function generateSearchTerms(title: string, categories: string[]): string[] {
  const titleWords = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1);

  const categoryTerms = categories.map((c) => c.toLowerCase());

  return [...new Set([...titleWords, ...categoryTerms])];
}
