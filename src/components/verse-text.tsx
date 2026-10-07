/** Renders verse markup (see src/bible/markup.ts) as nested <Text>. */
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { parseVerse } from '@/bible/markup';
import { useTheme } from '@/hooks/use-theme';

export type VerseTextProps = {
  text: string;
  fontSize: number;
  /** verse number shown before the text */
  label?: string;
  labelColor?: string;
  /** small tag after the verse number, e.g. "extra" for a verse the KJV doesn't have */
  badge?: string;
  redLetters?: boolean;
  /** show tagged Strong's numbers after their words */
  showStrongs?: boolean;
  /** bold the words tagged with these Strong's numbers */
  emphasize?: ReadonlySet<string>;
  onStrongPress?: (number: string) => void;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  /** inline content after the text, e.g. a tappable "note" marker */
  trailing?: ReactNode;
};

export function VerseText({
  text,
  fontSize,
  label,
  labelColor,
  badge,
  redLetters = true,
  showStrongs = false,
  emphasize,
  onStrongPress,
  numberOfLines,
  style,
  trailing,
}: VerseTextProps) {
  const theme = useTheme();
  const spans = parseVerse(text);
  const lineHeight = Math.round(fontSize * 1.55);

  // a word is tagged by the Strong's markers right after it
  const emphasized = new Set<number>();
  if (emphasize?.size) {
    spans.forEach((s, i) => {
      if (s.kind !== 'text') return;
      for (let j = i + 1; j < spans.length && spans[j].kind === 'strong'; j++) {
        const next = spans[j];
        if (next.kind === 'strong' && emphasize.has(next.number)) emphasized.add(i);
      }
    });
  }

  return (
    <Text style={[{ color: theme.text, fontSize, lineHeight }, style]} numberOfLines={numberOfLines}>
      {label ? (
        <Text style={[styles.label, { color: labelColor ?? theme.textSecondary, fontSize: fontSize * 0.62 }]}>{label} </Text>
      ) : null}
      {badge ? (
        <Text style={[styles.badge, { color: theme.textSecondary, backgroundColor: theme.backgroundElement, fontSize: fontSize * 0.55 }]}>
          {` ${badge} `}
        </Text>
      ) : null}
      {badge ? ' ' : null}
      {spans.map((s, i) => {
        switch (s.kind) {
          case 'text': {
            if (!emphasized.has(i)) {
              return (
                <Text key={i} style={[s.red && redLetters && { color: theme.redLetter }, s.italic && styles.italic]}>
                  {s.text}
                </Text>
              );
            }
            // keep the leading space out of the highlighted part
            const lead = /^\s*/.exec(s.text)?.[0] ?? '';
            return (
              <Fragment key={i}>
                {lead}
                <Text
                  style={[
                    styles.emphasis,
                    { backgroundColor: theme.backgroundSelected },
                    s.red && redLetters && { color: theme.redLetter },
                    s.italic && styles.italic,
                  ]}>
                  {s.text.slice(lead.length)}
                </Text>
              </Fragment>
            );
          }
          case 'strong':
            if (!showStrongs) return null;
            return (
              <Text
                key={i}
                onPress={onStrongPress ? () => onStrongPress(s.number) : undefined}
                style={[styles.strong, { color: theme.tint, fontSize: fontSize * 0.6 }]}>
                {s.number}
              </Text>
            );
          case 'break':
            return <Fragment key={i}>{'\n' + ' '.repeat(s.indent)}</Fragment>;
        }
      })}
      {trailing}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '700' },
  badge: { fontWeight: '600', fontStyle: 'italic', letterSpacing: 0.3 },
  italic: { fontStyle: 'italic' },
  emphasis: { fontWeight: '700' },
  strong: { fontWeight: '600' },
});
