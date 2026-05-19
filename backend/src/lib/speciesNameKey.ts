/**
 * 品种表检索键：去空白、Unicode 兼容分解（NFKC）、ASCII 小写，便于同一物种不同写法去重。
 */
export function normalizeSpeciesNameKey(name: string): string {
  const t = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const lowerAscii = t.replace(/[A-Za-z]+/g, (m) => m.toLowerCase());
  return lowerAscii.slice(0, 200);
}
