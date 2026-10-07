/** Daily readings (src/bible/lectionary.ts) for today or another day; tapping a reading opens it. */
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getBooks, useAsync } from '@/bible/queries';
import { readingAri, readingsFor, type Reading } from '@/bible/lectionary';
import { isChapterRead } from '@/bible/reading';
import { bookChapterTitle, openInReader } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { formatDate } from '@/calendar';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, IconButton, Row, SectionHeader } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { addDays, startOfDay } from '@/db/actions';
import { useTheme } from '@/hooks/use-theme';
import { useLanguage, useT } from '@/i18n';
import { settings, useSetting } from '@/settings';

export default function LectionaryScreen() {
  const theme = useTheme();
  const t = useT();
  const language = useLanguage();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [today] = useState(() => startOfDay(Date.now()));
  const [day, setDay] = useState(today);
  const [chapters] = useSetting(settings.readChapters);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { feast, readings } = readingsFor(day + 12 * 3_600_000);

  const kindLabel: Record<Reading['kind'], string> = {
    psalm: t('Psalm'),
    ot: t('Old Testament'),
    gospel: t('Gospel'),
    apostle: t('Apostle'),
    feast: t('Feast reading'),
  };

  return (
    <>
      <Stack.Screen options={{ title: t('Daily readings') }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.dateRow}>
          <IconButton icon={Icons.left} label={t('Previous day')} color={theme.tint} onPress={() => setDay(addDays(day, -1))} />
          <View style={styles.date}>
            <ThemedText type="smallBold" style={styles.center}>
              {formatDate(day, { weekday: true, day: true, month: 'long', year: true }, language, 'ethiopian')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              {formatDate(day, { day: true, month: 'long', year: true }, language, 'gregorian')}
            </ThemedText>
          </View>
          <IconButton icon={Icons.right} label={t('Next day')} color={theme.tint} onPress={() => setDay(addDays(day, 1))} />
        </View>
        {day !== today && <Button title={t('Today')} kind="plain" onPress={() => setDay(today)} />}
        {feast && (
          <View style={[styles.feast, { backgroundColor: theme.tintSoft }]}>
            <Icon name={Icons.event} size={18} color={theme.tint} />
            <ThemedText type="smallBold" style={styles.fill}>
              {t(feast)}
            </ThemedText>
          </View>
        )}
        <SectionHeader title={t('Readings')} />
        <View>
          {readings.map((r, i) => {
            const ari = readingAri(r);
            const read = isChapterRead(chapters, ari);
            return (
              <Row
                key={i}
                left={<Icon name={read ? Icons.checkCircle : Icons.circle} size={20} color={read ? theme.tint : theme.textSecondary} />}
                title={bookChapterTitle(books, ari) || '…'}
                subtitle={kindLabel[r.kind]}
                chevron
                onPress={() => openInReader(ari)}
              />
            );
          })}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          {t(
            'A reading cycle arranged on the Ethiopian church year: a psalm, the Old Testament, a Gospel and the Apostle every day, with readings for the great feasts. It is not the official lectionary of the church.',
          )}
        </ThemedText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  date: { flex: 1, gap: Spacing.half },
  center: { textAlign: 'center' },
  feast: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderRadius: 12 },
  fill: { flex: 1 },
  note: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three },
});
