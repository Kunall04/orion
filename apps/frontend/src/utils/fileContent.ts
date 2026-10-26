/**
 * Strips accidental line number prefixes (e.g. "1: ", "1: 1: ") that may have been injected
 * by tools or previous file saves. Monaco editor provides its own native gutter line numbering.
 */
export function stripCorruptLineNumbers(content: string): string {
  if (!content || typeof content !== 'string') return content;
  const lines = content.split('\n');
  if (lines.length === 0) return content;

  // 1. Check if any line has repeated line numbers like "1: 1: " or "1:  1: "
  const hasRepeated = lines.some((l) => /^\s*\d+:\s*\d+:/.test(l));

  // 2. Check if multiple lines start with sequential line numbers "1: ", "2: ", etc.
  let sequentialMatches = 0;
  let nonNumbers = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const line = lines[i];
    if (!line) continue;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\d+:\s*/.test(trimmed)) {
      sequentialMatches++;
    } else {
      nonNumbers++;
    }
  }

  const isCorrupted =
    hasRepeated ||
    (sequentialMatches >= 3 && nonNumbers <= 1) ||
    (lines.length <= 2 && sequentialMatches > 0 && /^\s*1:/.test(lines[0] ?? ''));

  if (isCorrupted) {
    return lines
      .map((line) => line.replace(/^([0-9]+:[ \t]?)+/, ''))
      .join('\n');
  }

  return content;
}
