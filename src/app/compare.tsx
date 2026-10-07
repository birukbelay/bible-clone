/**
 * The selected verses in every installed version, one under the other: ?ranges=<ari-ariEnd,...>.
 * Tapping a version opens the verses in the reader in that version.
 */
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { getBooks, getRange, useAsync } from '@/bible/queries';
import { formatVerses } from '@/bible/reading';
import { decodeRanges, formatRef } from '@/bible/reference';
import { useCurrentVersion, useVersions, type BibleVersion } from '@/bible/versions';
import { toast } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Empty, IconButton, Loading, type Interaction } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

export default function CompareScreen() {
  const params = useLocalSearchParams<{ ranges?: string }>();
  const t = useT();
  const theme = useTheme();
  const { versions } = useVersions();
  const current = useCurrentVersion();
  const ranges = decodeRanges(params.ranges);
  const { data: books } = useAsync(() => getBooks(current?.id ?? ''), [current?.id]);

  if (!ranges.length) return <Empty title={t('No verse selected')} />;
  const reference = ranges.map((r) => formatRef(books, r.ari, r.ariEnd)).join('; ');

  // the reader's version first, then the others in the usual order
  const ordered = current ? [current, ...versions.filter((v) => v.id !== current.id)] : versions;

  return (
    <>
      <Stack.Screen options={{ title: reference || t('Compare') }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}>
        {ordered.length < 2 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {t('Download more versions in Settings to compare them here.')}
          </ThemedText>
        )}
        {ordered.map((v) => (
          <VersionVerses key={v.id} version={v} ranges={ranges} paramRanges={params.ranges ?? ''} />
        ))}
      </ScrollView>
    </>
  );
}

function VersionVerses({ version, ranges, paramRanges }: { version: BibleVersion; ranges: { ari: number; ariEnd: number }[]; paramRanges: string }) {
  const theme = useTheme();
  const t = useT();
  const [fontSize] = useSetting(settings.fontSize);
  const [redLetters] = useSetting(settings.redLetters);
  const { data: books } = useAsync(() => getBooks(version.id), [version.id]);
  const { data: verses, loading } = useAsync(
    async () => (await Promise.all(ranges.map((r) => getRange(version.id, r.ari, r.ariEnd)))).flat(),
    [version.id, paramRanges],
  );
  const reference = ranges.map((r) => formatRef(books, r.ari, r.ariEnd)).join('; ');

  const open = () => {
    settings.version.set(version.id);
    settings.position.set(ranges[0].ari);
    router.dismissTo('/');
  };
  const copy = () => {
    if (!verses?.length) return;
    void Clipboard.setStringAsync(formatVerses(verses, reference, version.shortName)).then(() => toast(t('Copied')));
  };

  return (
    <View style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <Pressable
          onPress={open}
          accessibilityRole="link"
          accessibilityLabel={t('Open in {version}', { version: version.name })}
          style={({ pressed, hovered }: Interaction) => [styles.versionName, (pressed || hovered) && { opacity: 0.7 }]}>
          <ThemedText type="smallBold" themeColor="tint">
            {version.shortName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.fill}>
            {version.name}
          </ThemedText>
        </Pressable>
        <IconButton icon={Icons.copy} label={t('Copy')} size={18} color={theme.textSecondary} disabled={!verses?.length} onPress={copy} />
      </View>
      {loading && !verses ? (
        <Loading />
      ) : verses?.length ? (
        verses.map((v) => (
          <VerseText
            key={v.ari}
            text={v.text}
            label={verses.length > 1 ? v.label : undefined}
            fontSize={Math.max(14, fontSize - 2)}
            redLetters={redLetters}
          />
        ))
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {t('Not in {version}', { version: version.shortName })}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  hint: { textAlign: 'center' },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  versionName: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  fill: { flex: 1 },
});
