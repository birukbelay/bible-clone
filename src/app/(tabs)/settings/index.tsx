/**
 * Settings: Bible versions (installed / versions folder / download from a link or a catalog /
 * import a .db file), language, reading options, and sync status.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';

import {
  cancelDownload,
  chooseVersionsFolder,
  deleteVersion,
  displayName,
  downloadFromUrl,
  downloadVersion,
  fetchCatalog,
  folderSupported,
  forgetVersionsFolder,
  importFromDevice,
  LINK_DOWNLOAD,
  refreshFromFolder,
  useVersions,
  type CatalogEntry,
  type FolderRefresh,
} from '@/bible/versions';
import { confirm, notify, showError } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, IconButton, Row, SectionHeader, Segmented, SwitchRow } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGES, useT, type T } from '@/i18n';
import { settings, useSetting } from '@/settings';
import { hasLocalChanges, syncNow, useSyncState } from '@/sync';

const SAMPLE = 'For God so loved@[G25@] the world, that he gave his only begotten Son.';

export default function SettingsScreen() {
  const theme = useTheme();
  const bottomInset = useTabBottomInset();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
      <Versions />
      <VersionsFolder />
      <LinkDownload />
      <Catalog />
      <Language />
      <Appearance />
      <Reading />
      <Sync />
    </ScrollView>
  );
}

function Versions() {
  const theme = useTheme();
  const t = useT();
  const { versions } = useVersions();
  const [current, setCurrent] = useSetting(settings.version);
  const [importing, setImporting] = useState(false);

  const remove = (id: string, name: string) =>
    confirm({
      title: t('Remove {name}?', { name }),
      message: t('Your notes, highlights and tags are kept.'),
      confirmText: t('Remove'),
      destructive: true,
    }).then((ok) => {
      if (ok) deleteVersion(id).catch(showError(t('Could not remove')));
    });

  const importFile = () => {
    setImporting(true);
    importFromDevice()
      .then((v) => v && notify(t('Installed'), t('{name} was added.', { name: v.name })))
      .catch(showError(t('Could not import')))
      .finally(() => setImporting(false));
  };

  return (
    <>
      <SectionHeader title={t('Installed versions')} />
      {versions.map((v) => (
        <Row
          key={v.id}
          title={v.name}
          subtitle={[v.shortName, v.locale, v.strongs ? t("Strong's tagged") : null, v.bundled ? t('built in') : null]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => setCurrent(v.id)}
          right={
            <View style={styles.rowActions}>
              {v.id === current && <Icon name={Icons.check} color={theme.tint} />}
              {!v.bundled && (
                <IconButton
                  icon={Icons.trash}
                  label={t('Remove {name}', { name: v.name })}
                  color={theme.danger}
                  onPress={() => remove(v.id, v.name)}
                />
              )}
            </View>
          }
        />
      ))}
      <View style={styles.block}>
        <Button
          kind="plain"
          icon={Icons.file}
          title={importing ? t('Importing…') : t('Import a .db file')}
          disabled={importing}
          onPress={importFile}
        />
      </View>
    </>
  );
}

function refreshSummary(t: T, r: FolderRefresh) {
  const lines = [
    r.added.length ? t('Added: {names}', { names: r.added.join(', ') }) : null,
    r.updated.length ? t('Updated: {names}', { names: r.updated.join(', ') }) : null,
    r.failed.length ? t('Not Bible files: {names}', { names: r.failed.join(', ') }) : null,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : t('No new versions found.');
}

/**
 * Android: a public folder (Documents/Fyn Bible, ...) that holds a copy of every version, so the
 * files can be found, shared and backed up; .db files put there load on Refresh. Without it
 * (no folder chosen = no permission) the versions stay in the app's private storage.
 */
function VersionsFolder() {
  const t = useT();
  const [folder] = useSetting(settings.versionsFolder);
  const [busy, setBusy] = useState<'choose' | 'refresh' | null>(null);

  const run = (kind: 'choose' | 'refresh', job: () => Promise<FolderRefresh | null>) => {
    setBusy(kind);
    job()
      .then((r) => r && notify(t('Versions folder'), refreshSummary(t, r)))
      .catch(showError(kind === 'choose' ? t('Could not use this folder') : t('Could not refresh')))
      .finally(() => setBusy(null));
  };

  const forget = () =>
    confirm({
      title: t('Stop using this folder?'),
      message: t('The files in it and the installed versions are kept. New versions are only saved in app storage.'),
      confirmText: t('Stop using'),
    }).then((ok) => ok && forgetVersionsFolder());

  return (
    <>
      <SectionHeader title={t('Versions folder')} />
      {folderSupported ? (
        <>
          <Row
            left={<Icon name={Icons.folder} size={22} />}
            title={folder ? displayName(folder) : t('App storage (private)')}
            subtitle={
              folder
                ? t('Every version is also saved here. Put .db files in this folder and tap Refresh to load them.')
                : t('Choose a folder (for example Documents/Fyn Bible) to keep the versions where you can find them. Without one they stay in app storage.')
            }
          />
          <View style={[styles.block, styles.buttons]}>
            <Button
              kind="plain"
              icon={Icons.folder}
              title={busy === 'choose' ? t('Copying…') : folder ? t('Change folder') : t('Choose folder')}
              disabled={!!busy}
              onPress={() => run('choose', chooseVersionsFolder)}
            />
            <Button
              kind="plain"
              icon={Icons.refresh}
              title={busy === 'refresh' ? t('Loading…') : t('Refresh')}
              disabled={!!busy}
              onPress={() => run('refresh', refreshFromFolder)}
            />
            {folder ? <Button kind="plain" title={t('Stop using folder')} disabled={!!busy} onPress={forget} /> : null}
          </View>
        </>
      ) : (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'web'
              ? t('Downloaded versions are kept in this browser.')
              : t('Versions are kept in the app’s folder (Files app → On My iPhone → Fyn Bible when file sharing is on).')}
          </ThemedText>
          <Button
            kind="plain"
            icon={Icons.refresh}
            title={busy === 'refresh' ? t('Loading…') : t('Refresh')}
            disabled={!!busy}
            onPress={() => run('refresh', refreshFromFolder)}
          />
        </View>
      )}
    </>
  );
}

/** Download one .db file from a link (any web server; no catalog needed). */
function LinkDownload() {
  const theme = useTheme();
  const t = useT();
  const [url, setUrl] = useState('');
  const { downloads } = useVersions();
  const progress = downloads[LINK_DOWNLOAD];

  const download = () =>
    downloadFromUrl(url.trim())
      .then((v) => {
        if (!v) return;
        setUrl('');
        notify(t('Installed'), t('{name} was added.', { name: v.name }));
      })
      .catch((e: Error) => {
        if (e?.name !== 'AbortError') showError(t('Download failed'))(e);
      });

  return (
    <>
      <SectionHeader title={t('Download from a link')} />
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Link to a Bible .db file (or .db.gz on the web). It replaces an installed copy of the same version.')}
        </ThemedText>
        <Field
          value={url}
          onChangeText={setUrl}
          onSubmitEditing={download}
          placeholder="https://example.com/bibles/NASB.db"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          editable={progress == null}
        />
        {progress != null ? (
          <View style={styles.rowActions}>
            {progress >= 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('Downloading… {percent}%', { percent: Math.round(progress * 100) })}
              </ThemedText>
            ) : (
              <>
                <ActivityIndicator />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Downloading…')}
                </ThemedText>
              </>
            )}
            <IconButton icon={Icons.close} label={t('Cancel download')} color={theme.danger} onPress={() => cancelDownload(LINK_DOWNLOAD)} />
          </View>
        ) : (
          <Button kind="plain" icon={Icons.download} title={t('Download')} disabled={!url.trim()} onPress={download} />
        )}
      </View>
    </>
  );
}

function Catalog() {
  const theme = useTheme();
  const t = useT();
  const [url, setUrl] = useSetting(settings.catalogUrl);
  const [input, setInput] = useState(url);
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  // the saved catalog loads when the screen opens
  const [loading, setLoading] = useState(!!url);
  const { versions, downloads } = useVersions();

  const fetchFrom = (from: string) =>
    fetchCatalog(from)
      .then(setEntries)
      .catch((e) => {
        setEntries(null);
        showError(t('Could not load the catalog'))(e);
      })
      .finally(() => setLoading(false));
  const load = (from: string) => {
    if (!from) return;
    setLoading(true);
    fetchFrom(from);
  };

  useEffect(() => {
    if (url) fetchFrom(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    const next = input.trim();
    setUrl(next);
    if (next) load(next);
    else setEntries(null);
  };

  const download = (entry: CatalogEntry) =>
    downloadVersion(entry)
      .then((v) => v && notify(t('Installed'), t('{name} was added.', { name: v.name })))
      .catch((e: Error) => {
        if (e?.name !== 'AbortError') showError(t('Download failed'))(e);
      });

  return (
    <>
      <SectionHeader title={t('Download versions')} />
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Address of a versions catalog (a JSON file on any web server, see docs/fyn-rn-data.md).')}
        </ThemedText>
        <Field
          value={input}
          onChangeText={setInput}
          onSubmitEditing={submit}
          placeholder="https://example.com/bibles/catalog.json"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
        />
        <Button kind="plain" title={loading ? t('Loading…') : t('Load catalog')} disabled={loading || !input.trim()} onPress={submit} />
      </View>
      {entries?.map((e) => {
        const installed = versions.find((v) => v.id === e.id);
        const progress = downloads[e.id];
        const newer = installed && e.built_at && e.built_at > installed.builtAt;
        return (
          <Row
            key={e.id}
            title={e.name}
            subtitle={[e.short_name, e.locale, e.size ? formatSize(e.size) : null, e.description].filter(Boolean).join(' · ')}
            right={
              progress != null ? (
                <View style={styles.rowActions}>
                  {progress >= 0 ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {Math.round(progress * 100)}%
                    </ThemedText>
                  ) : (
                    <ActivityIndicator />
                  )}
                  <IconButton icon={Icons.close} label={t('Cancel download')} color={theme.danger} onPress={() => cancelDownload(e.id)} />
                </View>
              ) : installed && !newer ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('Installed')}
                </ThemedText>
              ) : (
                <IconButton
                  icon={Icons.download}
                  label={newer ? t('Update {name}', { name: e.name }) : t('Download {name}', { name: e.name })}
                  color={theme.tint}
                  onPress={() => download(e)}
                />
              )
            }
          />
        );
      })}
      {entries && !entries.length && (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('The catalog has no versions.')}
          </ThemedText>
        </View>
      )}
    </>
  );
}

function Language() {
  const t = useT();
  const [language, setLanguage] = useSetting(settings.language);
  const [calendar, setCalendar] = useSetting(settings.calendar);
  return (
    <>
      <SectionHeader title={t('Language')} />
      <View style={styles.block}>
        <Segmented
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.value === 'system' ? t('System') : l.label }))}
          value={language}
          onChange={setLanguage}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('Language of the buttons and menus. The Bible text is in the language of each version.')}
        </ThemedText>
      </View>
      <SectionHeader title={t('Calendar')} />
      <View style={styles.block}>
        <Segmented
          options={[
            { value: 'auto', label: t('Automatic') },
            { value: 'gregorian', label: t('Gregorian') },
            { value: 'ethiopian', label: t('Ethiopian') },
          ]}
          value={calendar}
          onChange={setCalendar}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('Dates in reading plans. Automatic uses the Ethiopian calendar when the app is in Amharic.')}
        </ThemedText>
      </View>
    </>
  );
}

function Appearance() {
  const t = useT();
  const [theme, setTheme] = useSetting(settings.theme);
  return (
    <>
      <SectionHeader title={t('Theme')} />
      <View style={styles.block}>
        <Segmented
          options={[
            { value: 'system', label: t('System') },
            { value: 'light', label: t('Light') },
            { value: 'dark', label: t('Dark') },
          ]}
          value={theme}
          onChange={setTheme}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t("System follows your device's light / dark mode.")}
        </ThemedText>
      </View>
    </>
  );
}

function Reading() {
  const theme = useTheme();
  const t = useT();
  const [fontSize, setFontSize] = useSetting(settings.fontSize);
  const [redLetters, setRedLetters] = useSetting(settings.redLetters);
  const [showStrongs, setShowStrongs] = useSetting(settings.showStrongs);
  return (
    <>
      <SectionHeader title={t('Reading')} />
      <Row
        title={t('Text size')}
        right={
          <View style={styles.rowActions}>
            <IconButton
              icon={Icons.textSmaller}
              label={t('Smaller text')}
              color={theme.tint}
              disabled={fontSize <= 12}
              onPress={() => setFontSize(fontSize - 1)}
            />
            <ThemedText style={styles.fontSize}>{fontSize}</ThemedText>
            <IconButton
              icon={Icons.textLarger}
              label={t('Larger text')}
              color={theme.tint}
              disabled={fontSize >= 34}
              onPress={() => setFontSize(fontSize + 1)}
            />
          </View>
        }
      />
      <View style={styles.block}>
        <VerseText text={`@6${SAMPLE}@5`} label="16" fontSize={fontSize} redLetters={redLetters} showStrongs={showStrongs} />
      </View>
      <SwitchRow title={t('Words of Jesus in red')} value={redLetters} onChange={setRedLetters} />
      <SwitchRow
        title={t("Show Strong's numbers")}
        subtitle={t("In versions tagged with Strong's numbers (KJV). Tap a number to open the dictionary.")}
        value={showStrongs}
        onChange={setShowStrongs}
      />
    </>
  );
}

function Sync() {
  const t = useT();
  const { backend, running, lastSyncedAt, lastError } = useSyncState();
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    hasLocalChanges().then(setPending, () => setPending(null));
  }, [running]);

  return (
    <>
      <SectionHeader title={t('Sync')} />
      <View style={styles.block}>
        {backend ? (
          <>
            <ThemedText>{backend.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {running
                ? t('Syncing…')
                : lastError
                  ? t('Last sync failed: {error}', { error: lastError })
                  : lastSyncedAt
                    ? t('Last synced {time}', { time: new Date(lastSyncedAt).toLocaleString() })
                    : t('Not synced yet')}
            </ThemedText>
            <Button kind="plain" icon={Icons.sync} title={t('Sync now')} disabled={running} onPress={() => syncNow()} />
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {Platform.OS === 'web'
              ? t('Bookmarks, notes, highlights, tags, topics and plans are stored in this browser only. Sync is prepared but no sync service is set up yet.')
              : t('Bookmarks, notes, highlights, tags, topics and plans are stored on this device only. Sync is prepared but no sync service is set up yet.')}
            {pending ? ` ${t('Changes made now will be uploaded when sync is turned on.')}` : ''}
          </ThemedText>
        )}
      </View>
    </>
  );
}

function formatSize(bytes: number) {
  return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  buttons: { flexDirection: 'row', flexWrap: 'wrap' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fontSize: { minWidth: 28, textAlign: 'center' },
});
