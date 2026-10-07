/**
 * Ge'ez script spelling variants. Amharic writes the same sound with different letters
 * (ሀ ሐ ኀ, ሰ ሠ, አ ዐ, ጸ ፀ, ቀ ቐ, and ሀ/ሃ, አ/ኣ for the laryngeals), so search treats them as equal:
 * every variant is folded to one letter of the same vowel order.
 *
 * Keep in step with GEEZ_FOLD in ../tools/build_bible_db.py, which folds the full-text index the same way.
 */

/** [first letter of the variant row, first letter of the row it folds to, letters in the row] */
const ROWS: [number, number, number][] = [
  [0x1210, 0x1200, 8], // ሐ -> ሀ
  [0x1280, 0x1200, 8], // ኀ -> ሀ
  [0x1220, 0x1230, 8], // ሠ -> ሰ
  [0x12d0, 0x12a0, 7], // ዐ -> አ
  [0x1340, 0x1338, 8], // ፀ -> ጸ
  [0x1250, 0x1240, 7], // ቐ -> ቀ
];

const MAP = new Map<number, number>();
for (const [from, to, count] of ROWS) for (let i = 0; i < count; i++) MAP.set(from + i, to + i);
// 4th order of the laryngeals sounds like the 1st: ሃ -> ሀ, ኣ -> አ (after the row folding above)
const ORDER4: Record<number, number> = { 0x1203: 0x1200, 0x12a3: 0x12a0 };

/** letters with spelling variants: the ones that fold, and the ones they fold to */
const VARIANTS = new Set([...MAP.keys(), ...MAP.values(), ...Object.keys(ORDER4).map(Number), ...Object.values(ORDER4)]);

function foldCode(c: number) {
  const row = MAP.get(c) ?? c;
  return ORDER4[row] ?? row;
}

export const hasGeez = (s: string) => /[ሀ-፿]/.test(s);

/** Text with every Ge'ez spelling variant replaced by its standard letter. */
export function foldGeez(s: string) {
  if (!hasGeez(s)) return s;
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c >= 0x1200 && c <= 0x137f ? String.fromCodePoint(foldCode(c)) : ch;
  }
  return out;
}

/** Whether a letter is spelled more than one way (so a LIKE pattern must not require it exactly). */
export function isVariantLetter(ch: string) {
  return VARIANTS.has(ch.codePointAt(0)!);
}
