/**
 * Settings: Bible versions (installed / catalog download / import a .db file), reading
 * options, and sync status.
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';

import {
  cancelDownload,
  deleteVersion,
  downloadVersion,
  fetchCatalog,
  importFromDevice,
  useVersions,
  type CatalogEntry,
} from '@/bible/versions';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, IconButton, Row, SectionHeader, Segmented, SwitchRow } from '@/components/ui';
import { VerseText } from '@/components/verse-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTabBottomInset } from '@/hooks/use-tab-inset';
import { useTheme } from '@/hooks/use-theme';
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
      <Catalog />
      <Appearance />
      <Reading />
      <Sync />
    </ScrollView>
  );
}

function errorAlert(title: string) {
  return (e: unknown) => Alert.alert(title, e instanceof Error ? e.message : String(e));
}

function Versions() {
  const theme = useTheme();
  const { versions } = useVersions();
  const [current, setCurrent] = useSetting(settings.version);
  const [importing, setImporting] = useState(false);

  const remove = (id: string, name: string) =>
    Alert.alert(`Remove ${name}?`, 'Your notes, highlights and tags are kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteVersion(id).catch(errorAlert('Could not remove')) },
    ]);

  const importFile = () => {
    setImporting(true);
    importFromDevice()
      .then((v) => v && Alert.alert('Installed', `${v.name} was added.`))
      .catch(errorAlert('Could not import'))
      .finally(() => setImporting(false));
  };

  return (
    <>
      <SectionHeader title="Installed versions" />
      {versions.map((v) => (
        <Row
          key={v.id}
          title={v.name}
          subtitle={[v.shortName, v.locale, v.strongs ? "Strong's tagged" : null, v.bundled ? 'built in' : null].filter(Boolean).join(' · ')}
          onPress={() => setCurrent(v.id)}
          right={
            <View style={styles.rowActions}>
              {v.id === current && <Icon name={Icons.check} color={theme.tint} />}
              {!v.bundled && <IconButton icon={Icons.trash} label={`Remove ${v.name}`} color={theme.danger} onPress={() => remove(v.id, v.name)} />}
            </View>
          }
        />
      ))}
      <View style={styles.block}>
        <Button kind="plain" icon={Icons.file} title={importing ? 'Importing…' : 'Import a .db file'} disabled={importing} onPress={importFile} />
      </View>
    </>
  );
}

function Catalog() {
  const theme = useTheme();
  const [url, setUrl] = useSetting(settings.catalogUrl);
  const [input, setInput] = useState(url);
  const [entries, setEntries] = useState<CatalogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { versions, downloads } = useVersions();

  const load = (from: string) => {
    if (!from) return;
    setLoading(true);
    fetchCatalog(from)
      .then(setEntries)
      .catch((e) => {
        setEntries(null);
        errorAlert('Could not load the catalog')(e);
      })
      .finally(() => setLoading(false));
  };

  // show the saved catalog when the screen opens
  useEffect(() => {
    if (url) load(url);
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
      .then((v) => v && Alert.alert('Installed', `${v.name} was added.`))
      .catch((e: Error) => {
        if (e?.name !== 'AbortError') errorAlert('Download failed')(e);
      });

  return (
    <>
      <SectionHeader title="Download versions" />
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          Address of a versions catalog (a JSON file on any web server, see docs/fyn-rn-data.md).
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
        <Button kind="plain" title={loading ? 'Loading…' : 'Load catalog'} disabled={loading || !input.trim()} onPress={submit} />
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
                  <IconButton icon={Icons.close} label="Cancel download" color={theme.danger} onPress={() => cancelDownload(e.id)} />
                </View>
              ) : installed && !newer ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Installed
                </ThemedText>
              ) : (
                <IconButton
                  icon={Icons.download}
                  label={newer ? `Update ${e.name}` : `Download ${e.name}`}
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
            The catalog has no versions.
          </ThemedText>
        </View>
      )}
    </>
  );
}

function Appearance() {
  const [theme, setTheme] = useSetting(settings.theme);
  return (
    <>
      <SectionHeader title="Theme" />
      <View style={styles.block}>
        <Segmented
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          value={theme}
          onChange={setTheme}
        />
        <ThemedText type="small" themeColor="textSecondary">
          System follows your phone's light / dark mode.
        </ThemedText>
      </View>
    </>
  );
}

function Reading() {
  const theme = useTheme();
  const [fontSize, setFontSize] = useSetting(settings.fontSize);
  const [redLetters, setRedLetters] = useSetting(settings.redLetters);
  const [showStrongs, setShowStrongs] = useSetting(settings.showStrongs);
  return (
    <>
      <SectionHeader title="Reading" />
      <Row
        title="Text size"
        right={
          <View style={styles.rowActions}>
            <IconButton icon={Icons.textSmaller} label="Smaller text" color={theme.tint} disabled={fontSize <= 12} onPress={() => setFontSize(fontSize - 1)} />
            <ThemedText style={styles.fontSize}>{fontSize}</ThemedText>
            <IconButton icon={Icons.textLarger} label="Larger text" color={theme.tint} disabled={fontSize >= 34} onPress={() => setFontSize(fontSize + 1)} />
          </View>
        }
      />
      <View style={styles.block}>
        <VerseText text={`@6${SAMPLE}@5`} label="16" fontSize={fontSize} redLetters={redLetters} showStrongs={showStrongs} />
      </View>
      <SwitchRow title="Words of Jesus in red" value={redLetters} onChange={setRedLetters} />
      <SwitchRow
        title="Show Strong's numbers"
        subtitle="In versions tagged with Strong's numbers (KJV). Tap a number to open the dictionary."
        value={showStrongs}
        onChange={setShowStrongs}
      />
    </>
  );
}

function Sync() {
  const { backend, running, lastSyncedAt, lastError } = useSyncState();
  const [pending, setPending] = useState<boolean | null>(null);

  useEffect(() => {
    hasLocalChanges().then(setPending, () => setPending(null));
  }, [running]);

  return (
    <>
      <SectionHeader title="Sync" />
      <View style={styles.block}>
        {backend ? (
          <>
            <ThemedText>{backend.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {running
                ? 'Syncing…'
                : lastError
                  ? `Last sync failed: ${lastError}`
                  : lastSyncedAt
                    ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}`
                    : 'Not synced yet'}
            </ThemedText>
            <Button kind="plain" icon={Icons.sync} title="Sync now" disabled={running} onPress={() => syncNow()} />
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Bookmarks, notes, highlights, tags and topics are stored on this device only. Sync is prepared but no sync
            service is set up yet.
            {pending ? ' Changes made now will be uploaded when sync is turned on.' : ''}
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
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fontSize: { minWidth: 28, textAlign: 'center' },
});
