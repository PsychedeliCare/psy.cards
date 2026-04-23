export function keyToSlug(key: string): string {
  return key.replace(/\//g, "-");
}

export function pairSlug(keyA: string, keyB: string): string {
  return `${keyToSlug(keyA)}~${keyToSlug(keyB)}`;
}

export function parsePairSlug(slug: string): [string, string] | null {
  const parts = slug.split("~");
  if (parts.length !== 2) return null;
  return [parts[0]!, parts[1]!];
}
