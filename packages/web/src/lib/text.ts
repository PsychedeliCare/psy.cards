/** Title-case each word; preserves separators like slashes and hyphens. */
export function toTitleCase(text: string): string {
  return text.replace(/\b\w+/g, (word) =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  );
}
