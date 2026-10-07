/**
 * Verse image: the selected verses on a square card with a choice of backgrounds and type,
 * shared as a PNG. Phones capture the card (react-native-view-shot); the web draws it on a canvas.
 * ?ranges=<ari-ariEnd>&version=<id>
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { plainText } from '@/bible/markup';
import { getBooks, getRange, useAsync } from '@/bible/queries';
import { decodeRanges, formatRef } from '@/bible/reference';
import { getVersion, useCurrentVersion } from '@/bible/versions';
import { notify, share, showError } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Segmented } from '@/components/ui';
import { Fonts, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { imageCaptureAvailable, shareVerseImage } from '@/native/files';

const BACKGROUNDS = [
  { background: '#1F2A44', color: '#F5F1E6' },
  { background: '#F5F1E6', color: '#2B2620' },
  { background: '#0F5132', color: '#F1F8F4' },
  { background: '#7A2E2E', color: '#FBEFEF' },
  { background: '#000000', color: '#FFFFFF' },
  { background: '#FFFFFF', color: '#111111' },
  { background: '#5B3E96', color: '#F4F0FB' },
  { background: '#C27C0E', color: '#FFF8EC' },
] as const;

/** Font stacks the web canvas can draw with (it does not resolve CSS variables). */
const CANVAS_FONTS = { serif: 'Georgia, "Noto Serif Ethiopic", serif', sans: 'system-ui, "Noto Sans Ethiopic", sans-serif' };

export default function VerseImageScreen() {
  const params = useLocalSearchParams<{ ranges?: string; version?: string }>();
  const t = useT();
  const theme = useTheme();
  const current = useCurrentVersion();
  const versionId = params.version || current?.id || '';
  const version = getVersion(versionId);
  const range = decodeRanges(params.ranges)[0];
  const [style, setStyle] = useState(0);
  const [font, setFont] = useState<'serif' | 'sans'>('serif');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [showVersion, setShowVersion] = useState(true);
  const [busy, setBusy] = useState(false);
  const card = useRef<View>(null);
  const { width } = useWindowDimensions();
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { data: verses } = useAsync(
    () => (range ? getRange(versionId, range.ari, range.ariEnd) : Promise.resolve([])),
    [versionId, range?.ari, range?.ariEnd],
  );

  if (!range) return <Empty title={t('No verse selected')} />;

  const text = verses?.map((v) => plainText(v.text).trim()).join(' ') ?? '';
  const reference = formatRef(books, range.ari, range.ariEnd) + (showVersion && version ? ` · ${version.shortName}` : '');
  const colors = BACKGROUNDS[style];
  const side = Math.min(width - Spacing.three * 2, MaxContentWidth - Spacing.three * 2, 520);
  // shrink long passages so they fit the square
  const base = { small: 0.8, medium: 1, large: 1.2 }[size] * side * 0.06;
  const fontSize = Math.max(11, Math.min(base, base * Math.sqrt(220 / Math.max(text.length, 1))));

  const shareImage = async () => {
    setBusy(true);
    try {
      const ok = await shareVerseImage(
        card.current,
        { text: `“${text}”`, reference, background: colors.background, color: colors.color, font: CANVAS_FONTS[font], size: fontSize * (1080 / side) / 2.4 },
        reference.replace(/[^\p{L}\p{N}]+/gu, '-'),
      );
      if (!ok) {
        notify(
          t('Images are not available'),
          t('This build of the app cannot make images. The text is shared instead.'),
        );
        await share(`“${text}”\n— ${reference}`);
      }
    } catch (e) {
      showError(t('Could not share'))(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('Verse image') }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <View
          ref={card}
          collapsable={false}
          style={[styles.card, { width: side, height: side, backgroundColor: colors.background }]}
          accessibilityLabel={`${text} ${reference}`}>
          <Text
            style={[styles.text, { color: colors.color, fontSize, lineHeight: fontSize * 1.4, fontFamily: Fonts[font] }]}
            adjustsFontSizeToFit
            numberOfLines={18}>
            {`“${text}”`}
          </Text>
          <Text style={[styles.reference, { color: colors.color, fontSize: fontSize * 0.8, fontFamily: Fonts[font] }]}>{reference}</Text>
        </View>

        <ThemedText type="smallBold">{t('Background')}</ThemedText>
        <View style={styles.swatches}>
          {BACKGROUNDS.map((b, i) => (
            <Pressable
              key={b.background}
              onPress={() => setStyle(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected: i === style }}
              accessibilityLabel={t('Background {n}', { n: i + 1 })}
              style={[
                styles.swatch,
                { backgroundColor: b.background, borderColor: i === style ? theme.tint : theme.border },
                i === style && styles.swatchSelected,
              ]}>
              <Text style={{ color: b.color, fontSize: 16, fontFamily: Fonts.serif }}>Aa</Text>
            </Pressable>
          ))}
        </View>
        <ThemedText type="smallBold">{t('Font')}</ThemedText>
        <Segmented
          options={[
            { value: 'serif', label: t('Serif') },
            { value: 'sans', label: t('Sans serif') },
          ]}
          value={font}
          onChange={setFont}
        />
        <ThemedText type="smallBold">{t('Text size')}</ThemedText>
        <Segmented
          options={[
            { value: 'small', label: t('Small') },
            { value: 'medium', label: t('Medium') },
            { value: 'large', label: t('Large') },
          ]}
          value={size}
          onChange={setSize}
        />
        <Segmented
          options={[
            { value: 'yes', label: t('With version name') },
            { value: 'no', label: t('Reference only') },
          ]}
          value={showVersion ? 'yes' : 'no'}
          onChange={(v) => setShowVersion(v === 'yes')}
        />
        <Button title={busy ? t('Preparing…') : t('Share image')} icon={Icons.share} disabled={busy || !verses} onPress={shareImage} />
        {!imageCaptureAvailable() && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('Sharing images needs react-native-view-shot in the app build; without it the text is shared.')}
          </ThemedText>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { alignSelf: 'center', borderRadius: 18, padding: '9%', justifyContent: 'center', alignItems: 'center', gap: Spacing.three, overflow: 'hidden' },
  text: { textAlign: 'center' },
  reference: { textAlign: 'center', fontWeight: '700', opacity: 0.8 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  swatch: { width: 48, height: 48, borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  swatchSelected: { borderWidth: 3 },
});
