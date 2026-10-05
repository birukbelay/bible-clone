/**
 * Verse text markup (inherited from the old app's zoe files, kept as-is in the .db files):
 *   @6 … @5   red letters          @9 … @7   italics (translator additions)
 *   @8        line break           @0 … @4   line break + indent level (poetry)
 *   @^        paragraph            @[G25@]   Strong's number for the preceding word(s)
 *   @/, @<…@> ignored
 */

export type Span =
  | { kind: 'text'; text: string; red: boolean; italic: boolean }
  | { kind: 'strong'; number: string }
  | { kind: 'break'; indent: number; paragraph: boolean };

const TOKEN = /@\[([GH]\d+)@\]|@<[\s\S]*?@>|@([0-9^/])/g;

export function parseVerse(text: string): Span[] {
  const spans: Span[] = [];
  let red = false;
  let italic = false;
  let last = 0;
  let leading = true;

  const pushText = (s: string) => {
    if (!s) return;
    if (leading && !s.trim()) return;
    leading = false;
    const prev = spans[spans.length - 1];
    if (prev?.kind === 'text' && prev.red === red && prev.italic === italic) prev.text += s;
    else spans.push({ kind: 'text', text: s, red, italic });
  };

  for (const m of text.matchAll(TOKEN)) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) {
      spans.push({ kind: 'strong', number: m[1] });
      continue;
    }
    switch (m[2]) {
      case '6': red = true; break;
      case '5': red = false; break;
      case '9': italic = true; break;
      case '7': italic = false; break;
      case '8':
        if (!leading) spans.push({ kind: 'break', indent: 0, paragraph: false });
        break;
      case '^':
        if (!leading) spans.push({ kind: 'break', indent: 0, paragraph: true });
        break;
      case '0': case '1': case '2': case '3': case '4':
        // a leading indent marker indents the first line, otherwise it starts a new line
        spans.push({ kind: 'break', indent: Number(m[2]), paragraph: false });
        leading = false;
        break;
    }
  }
  pushText(text.slice(last));
  return spans;
}

/** Strong's numbers in a verse, in text order, without duplicates. */
export function strongsIn(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/@\[([GH]\d+)@\]/g), (m) => m[1]))];
}

/** Text for copy / share / previews. */
export function plainText(text: string) {
  return text
    .replace(/@\[[\s\S]*?@\]|@<[\s\S]*?@>/g, '')
    .replace(/@[0-9^/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type DescriptionPart = { text: string } | { strong: string };

/**
 * Strong's dictionary description: "from σοφός(<strong>G4680</strong>); wisdom …:--wisdom.<br> KJV Usage:: …"
 * -> definition parts with clickable cross references, and the translation list after ":--".
 */
export function parseStrongsDescription(description: string | null) {
  const body = (description ?? '').split('KJV Usage::')[0];
  const [definition, translation] = body.split(':--');
  const clean = (s: string) =>
    s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<(?!\/?strong>)[^>]+>/g, '')
      .replace(/[ \t]+/g, ' ')
      .trim();
  const parts: DescriptionPart[] = [];
  const src = clean(definition ?? '');
  let last = 0;
  for (const m of src.matchAll(/<strong>\s*([GH]\d+)\s*<\/strong>/g)) {
    if (m.index > last) parts.push({ text: src.slice(last, m.index) });
    parts.push({ strong: m[1] });
    last = m.index + m[0].length;
  }
  if (last < src.length) parts.push({ text: src.slice(last).replace(/<\/?strong>/g, '') });
  return {
    parts,
    translation: translation ? clean(translation).replace(/<\/?strong>/g, '').replace(/\.$/, '') : null,
  };
}

/** "g25", "25", "H 430" -> "G25" / "H430"; bare digits default to Greek. */
export function normalizeStrong(input: string): string | null {
  const m = /^\s*([GHgh])?\s*0*(\d{1,5})\s*$/.exec(input);
  if (!m) return null;
  return `${(m[1] ?? 'G').toUpperCase()}${m[2]}`;
}
