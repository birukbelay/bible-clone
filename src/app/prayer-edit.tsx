/**
 * Write or edit a prayer. New: no params, or ?ranges=<ari-ariEnd> to rest it on verses;
 * existing: ?id=<prayer id>.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { getBooks, getRange, useAsync } from '@/bible/queries';
import { decodeRanges, formatRef, openInReader } from '@/bible/reference';
import { useCurrentVersion } from '@/bible/versions';
import { confirm, notify } from '@/components/dialogs';
import { Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Field, IconButton, Loading, SwitchRow } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { database, type Prayer } from '@/db';
import { deletePrayer, savePrayer, setPrayerAnswered } from '@/db/actions';
import { useRecord } from '@/db/hooks';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

type Range = { ari: number; ariEnd: number };

export default function PrayerEditScreen() {
  const params = useLocalSearchParams<{ id?: string; ranges?: string }>();
  const t = useT();
  const prayer = useRecord(
    () => (params.id ? database.get<Prayer>('prayers').find(params.id) : null),
    (p) => ({ title: p.title, body: p.body, ari: p.ari, ariEnd: p.ariEnd, answeredAt: p.answeredAt }),
    [params.id],
  );

  if (params.id && prayer === undefined) return <Loading />;
  if (params.id && !prayer) return <Empty title={t('This prayer was deleted')} />;

  const range: Range | null = prayer
    ? prayer.ari != null
      ? { ari: prayer.ari, ariEnd: prayer.ariEnd ?? prayer.ari }
      : null
    : (decodeRanges(params.ranges)[0] ?? null);

  return (
    <PrayerEditor
      key={params.id ?? params.ranges ?? 'new'}
      record={prayer?.record ?? null}
      initial={{ title: prayer?.title ?? '', body: prayer?.body ?? '' }}
      answered={prayer?.answeredAt != null}
      range={range}
    />
  );
}

function PrayerEditor({
  record,
  initial,
  answered,
  range: initialRange,
}: {
  record: Prayer | null;
  initial: { title: string; body: string };
  answered: boolean;
  range: Range | null;
}) {
  const theme = useTheme();
  const t = useT();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [range, setRange] = useState(initialRange);
  const [saving, setSaving] = useState(false);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const { data: verses } = useAsync(
    () => (range ? getRange(versionId, range.ari, range.ariEnd) : Promise.resolve([])),
    [versionId, range?.ari, range?.ariEnd],
  );
  const changed = title !== initial.title || body !== initial.body || range !== initialRange;

  const save = () => {
    setSaving(true);
    Promise.resolve()
      .then(() => savePrayer(record, { title, body, range }))
      .then(
        () => router.back(),
        (e: Error) => {
          setSaving(false);
          notify(t('Could not save'), e.message);
        },
      );
  };

  const remove = () =>
    record &&
    confirm({ title: t('Delete this prayer?'), confirmText: t('Delete'), destructive: true }).then((ok) => {
      if (ok) deletePrayer(record).then(() => router.back());
    });

  return (
    <>
      <Stack.Screen
        options={{
          title: record ? t('Prayer') : t('New prayer'),
          headerRight: record
            ? () => <IconButton icon={Icons.trash} label={t('Delete prayer')} color={theme.danger} onPress={remove} />
            : undefined,
        }}
      />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field value={title} onChangeText={setTitle} placeholder={t('What are you praying for?')} autoFocus={!record} returnKeyType="next" />
        <Field
          value={body}
          onChangeText={setBody}
          placeholder={t('Details (optional)')}
          multiline
          textAlignVertical="top"
          style={styles.body}
        />
        {range && (
          <View style={[styles.verse, { backgroundColor: theme.backgroundElement }]}>
            <View style={styles.verseHeader}>
              <ThemedText type="smallBold" themeColor="tint" style={styles.fill} onPress={() => openInReader(range.ari)}>
                {formatRef(books, range.ari, range.ariEnd)}
              </ThemedText>
              <IconButton icon={Icons.close} label={t('Remove the verse')} size={18} color={theme.textSecondary} onPress={() => setRange(null)} />
            </View>
            {verses?.map((v) => (
              <VerseText key={v.ari} text={v.text} label={verses.length > 1 ? v.label : undefined} fontSize={15} numberOfLines={6} />
            ))}
          </View>
        )}
        {record && (
          <SwitchRow
            title={t('Answered')}
            value={answered}
            onChange={(v) => {
              setPrayerAnswered(record, v).catch((e: Error) => notify(t('Could not save'), e.message));
            }}
          />
        )}
        <Button
          title={saving ? t('Saving…') : t('Save')}
          icon={Icons.check}
          disabled={saving || !title.trim() || (record != null && !changed)}
          onPress={save}
        />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', padding: Spacing.three, gap: Spacing.three },
  body: { minHeight: 140 },
  verse: { borderRadius: 12, padding: Spacing.three, gap: Spacing.one },
  verseHeader: { flexDirection: 'row', alignItems: 'center' },
  fill: { flex: 1 },
});
