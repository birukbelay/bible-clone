/**
 * Backup & export, all as files the user keeps themselves (no account, no server):
 * a JSON backup of all user data and its restore, notes as Markdown / text / PDF, and a Bible
 * version's .db file to pass to another phone.
 */
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { getBooks } from '@/bible/queries';
import { shareVersion, useCurrentVersion, useVersions } from '@/bible/versions';
import { backupCounts, backupFileName, createBackup, exportNotes, notesCount, notesPage, parseBackup, restoreBackup } from '@/backup';
import { useDates } from '@/calendar';
import { confirm, notify, showError } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Row, SectionHeader } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { fileSharingAvailable, pickText, printAvailable, printHtml, saveText, sharePdf } from '@/native/files';

export default function BackupScreen() {
  const theme = useTheme();
  const t = useT();
  const dates = useDates();
  const version = useCurrentVersion();
  const versionId = version?.id ?? '';
  const { versions } = useVersions();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<number | null>(null);

  useEffect(() => {
    notesCount().then(setNotes, () => setNotes(null));
    // books load the version's names for the exported references
    getBooks(versionId).catch(() => {});
  }, [versionId]);

  const run = (key: string, job: () => Promise<unknown>, error: string) => {
    setBusy(key);
    job()
      .catch(showError(error))
      .finally(() => setBusy(null));
  };

  const backup = () =>
    run(
      'backup',
      async () => {
        const data = await createBackup();
        await saveText(backupFileName(data.exportedAt), JSON.stringify(data), 'application/json');
      },
      t('Could not make the backup'),
    );

  const restore = () =>
    run(
      'restore',
      async () => {
        const text = await pickText(['application/json', 'text/plain', '*/*']);
        if (text == null) return;
        let data;
        try {
          data = parseBackup(text);
        } catch (e) {
          notify(t('Not a backup'), t((e as Error).message));
          return;
        }
        const c = backupCounts(data);
        const summary = t(
          'Backup of {date}: {bookmarks} bookmarks, {notes} notes, {highlights} highlights, {tags} tags, {topics} topics, {plans} plans, {memory} memory verses, {prayers} prayers.',
          { date: dates.format(data.exportedAt, { day: true, month: 'long', year: true }), ...c },
        );
        const replace = await confirm({
          title: t('Replace the data on this device?'),
          message: `${summary}\n\n${t('Replace deletes what is on this device now and puts the backup in its place. Cancel to add only what is missing instead.')}`,
          confirmText: t('Replace'),
          destructive: true,
        });
        if (!replace) {
          const merge = await confirm({
            title: t('Add what is missing?'),
            message: t('Records from the backup that are not on this device are added; nothing is deleted.'),
            confirmText: t('Add'),
          });
          if (!merge) return;
        }
        const added = await restoreBackup(data, replace ? 'replace' : 'merge');
        notify(t('Restored'), t('{count} records restored.', { count: added }));
      },
      t('Could not restore'),
    );

  const title = t('Notes');
  const notesFile = (format: 'md' | 'txt') =>
    run(
      format,
      async () => {
        const text = await exportNotes(versionId, format, title);
        await saveText(`fyn-bible-notes.${format}`, text, format === 'md' ? 'text/markdown' : 'text/plain');
      },
      t('Could not export'),
    );
  const notesPdf = () =>
    run(
      'pdf',
      async () => {
        const html = await notesPage(versionId, title);
        if (Platform.OS === 'web') await printHtml(html);
        else if (!(await sharePdf(html, 'fyn-bible-notes'))) notify(t('Printing is not available'), t('This build of the app cannot print.'));
      },
      t('Could not export'),
    );

  const sendVersion = (id: string) =>
    run(
      `db-${id}`,
      async () => {
        if (!(await shareVersion(id))) notify(t('Sharing is not available'), t('This build of the app cannot share files.'));
      },
      t('Could not share'),
    );

  return (
    <>
      <Stack.Screen options={{ title: t('Backup & export') }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <SectionHeader title={t('Backup')} />
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t(
              'A backup file holds your bookmarks, notes, highlights, tags, topics, plans, memory verses, prayers, reading progress and settings. Keep it anywhere (Files, a computer, a message to yourself) and restore it on this or another device.',
            )}
          </ThemedText>
          <View style={styles.buttons}>
            <Button icon={Icons.save} title={busy === 'backup' ? t('Preparing…') : t('Make a backup')} disabled={!!busy} onPress={backup} />
            <Button kind="plain" icon={Icons.restore} title={busy === 'restore' ? t('Restoring…') : t('Restore')} disabled={!!busy} onPress={restore} />
          </View>
        </View>

        <SectionHeader title={t('Export notes')} />
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {notes == null ? '' : notes ? t('{count} notes, with the verses they are on.', { count: notes }) : t('No notes yet.')}
          </ThemedText>
          <View style={styles.buttons}>
            <Button kind="plain" icon={Icons.file} title={t('Markdown')} disabled={!!busy || !notes} onPress={() => notesFile('md')} />
            <Button kind="plain" icon={Icons.file} title={t('Text')} disabled={!!busy || !notes} onPress={() => notesFile('txt')} />
            {(Platform.OS === 'web' || printAvailable()) && (
              <Button kind="plain" icon={Icons.print} title={t('PDF')} disabled={!!busy || !notes} onPress={notesPdf} />
            )}
          </View>
        </View>

        <SectionHeader title={t('Share a Bible version')} />
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Send a version’s .db file to another phone (Bluetooth, Nearby Share, a messaging app, …). There it is added with Settings → Import a .db file.')}
          </ThemedText>
          {Platform.OS === 'android' && !fileSharingAvailable() && (
            <ThemedText type="small" themeColor="danger">
              {t('This build of the app cannot share files.')}
            </ThemedText>
          )}
        </View>
        {versions.map((v) => (
          <Row
            key={v.id}
            left={<Icon name={Icons.book} size={18} />}
            title={v.name}
            subtitle={v.shortName}
            detail={busy === `db-${v.id}` ? t('Preparing…') : undefined}
            onPress={busy ? undefined : () => sendVersion(v.id)}
            right={<Icon name={Icons.share} size={18} color={theme.tint} />}
          />
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.three },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
