/**
 * Audio Bible settings, per version: where a version's audio comes from (a URL template, files
 * downloaded or imported to the device), downloading chapters for offline listening, and the
 * listening options. Versions without audio are read aloud by the phone's voice instead.
 */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { bookOf, makeAri } from '@/bible/ari';
import {
  audioStats,
  bookChapters,
  cancelAudioDownload,
  deleteAudio,
  downloadChapters,
  fillTemplate,
  importAudioFiles,
  localAudioSupported,
  useAudioState,
  versionsWithFiles,
} from '@/bible/audio';
import { currentRate, listeningAvailable, RATES, setRate, start } from '@/bible/playback';
import { getBooks, useAsync } from '@/bible/queries';
import { bookChapterTitle } from '@/bible/reference';
import { useCurrentVersion, useVersions } from '@/bible/versions';
import { confirm, notify, showError } from '@/components/dialogs';
import { Icon, Icons } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Field, IconButton, Row, SectionHeader, Segmented, SwitchRow } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { getVoices, speechAvailable, type Voice } from '@/native/speech';
import { settings, useSetting } from '@/settings';

export default function AudioScreen() {
  const theme = useTheme();
  const t = useT();
  const params = useLocalSearchParams<{ version?: string }>();
  const current = useCurrentVersion();
  const { versions } = useVersions();
  const [selected, setSelected] = useState(params.version || current?.id || '');
  const audio = useAudioState();
  // audio files of versions whose text was removed can still be deleted
  const orphans = versionsWithFiles().filter((id) => !versions.some((v) => v.id === id));
  void audio.revision;

  return (
    <>
      <Stack.Screen options={{ title: t('Audio Bible') }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}>
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t(
              'Each version can have its own audio Bible: a link pattern to recordings on any web server, or audio files on this device. Without audio, the chapter is read aloud by the phone’s voice; without that, the play button scrolls the text.',
            )}
          </ThemedText>
          {!listeningAvailable() && (
            <ThemedText type="small" themeColor="danger">
              {t('This build of the app has neither the audio player nor reading aloud; the play button scrolls the text.')}
            </ThemedText>
          )}
        </View>

        <SectionHeader title={t('Version')} />
        <View style={[styles.block, styles.chips]}>
          {versions.map((v) => (
            <Chip
              key={v.id}
              label={v.shortName}
              selected={v.id === selected}
              onPress={() => setSelected(v.id)}
              right={settings.audioSources.get()[v.id]?.template || audioStats(v.id).chapters ? <Icon name={Icons.headphones} size={14} color={v.id === selected ? '#ffffff' : theme.tint} /> : undefined}
            />
          ))}
        </View>
        {selected ? <VersionAudio key={selected} versionId={selected} /> : null}

        <Listening />

        {orphans.length > 0 && (
          <>
            <SectionHeader title={t('Audio of removed versions')} />
            {orphans.map((id) => (
              <OrphanRow key={id} versionId={id} />
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

function VersionAudio({ versionId }: { versionId: string }) {
  const theme = useTheme();
  const t = useT();
  const [sources, setSources] = useSetting(settings.audioSources);
  const [position] = useSetting(settings.position);
  const source = sources[versionId] ?? {};
  const [template, setTemplate] = useState(source.template ?? '');
  const [timingsUrl, setTimingsUrl] = useState(source.timings ?? '');
  const { downloads, revision } = useAudioState();
  const progress = downloads[versionId];
  const [busy, setBusy] = useState(false);
  const { data: books } = useAsync(() => getBooks(versionId), [versionId]);
  const stats = audioStats(versionId);
  void revision;

  const book = bookOf(position);
  const bookInfo = books?.find((b) => b.book === book);
  const sample = makeAri(book, 1, 1);
  const changed = template.trim() !== (source.template ?? '') || timingsUrl.trim() !== (source.timings ?? '');
  const valid = !template.trim() || /^https?:\/\/.+\{(chapter|chapter2|chapter3)\}/.test(template.trim());

  const save = () => {
    const next = { ...sources };
    if (template.trim()) next[versionId] = { template: template.trim(), timings: timingsUrl.trim() || undefined };
    else delete next[versionId];
    setSources(next);
  };

  const download = (chapters: number[]) => {
    downloadChapters(versionId, chapters).then(
      (failed) => failed && notify(t('Some chapters could not be downloaded'), t('{count} chapters failed. Check the link and try again.', { count: failed })),
      showError(t('Download failed')),
    );
  };
  const downloadBook = () => bookInfo && download(bookChapters(book, bookInfo.chapters));
  const downloadAll = () =>
    books &&
    confirm({
      title: t('Download the whole Bible?'),
      message: t('About 1,189 chapters; this can take several gigabytes and a long time. Keep the app open while it downloads.'),
      confirmText: t('Download'),
    }).then((ok) => ok && download(books.flatMap((b) => bookChapters(b.book, b.chapters))));

  const importFiles = () => {
    setBusy(true);
    importAudioFiles(versionId)
      .then((r) => {
        if (!r) return;
        notify(
          t('Imported'),
          [
            t('{count} chapters added.', { count: r.added }),
            r.skipped.length ? t('Skipped (the name does not say the chapter): {names}', { names: r.skipped.slice(0, 8).join(', ') }) : '',
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }, showError(t('Could not import')))
      .finally(() => setBusy(false));
  };

  const remove = () =>
    confirm({
      title: t('Delete the audio files of this version?'),
      message: t('{count} chapters are removed from this device. The link stays.', { count: stats.chapters }),
      confirmText: t('Delete'),
      destructive: true,
    }).then((ok) => ok && deleteAudio(versionId));

  const test = () =>
    start(versionId, position).then((ok) => !ok && notify(t('Nothing to play'), t('This version has no audio for this chapter and reading aloud is not available.')));

  return (
    <>
      <View style={styles.block}>
        <View style={styles.status}>
          <Icon
            name={source.template || stats.chapters ? Icons.headphones : Icons.speaker}
            size={20}
            color={source.template || stats.chapters ? theme.tint : theme.textSecondary}
          />
          <ThemedText type="small" style={styles.fill}>
            {stats.chapters && source.template
              ? t('Plays the {count} chapters on this device, the others from the link.', { count: stats.chapters })
              : stats.chapters
                ? t('Plays the {count} chapters on this device; the others are read aloud.', { count: stats.chapters })
                : source.template
                  ? t('Plays from the link (needs the internet).')
                  : t('No audio: chapters are read aloud by the phone’s voice.')}
          </ThemedText>
        </View>
        {stats.chapters > 0 && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('{count} chapters on this device · {size}', { count: stats.chapters, size: formatSize(stats.size) })}
          </ThemedText>
        )}
      </View>

      <SectionHeader title={t('Audio link')} />
      <View style={styles.block}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Link pattern of the chapter recordings. {BOOK} is the book code (JHN), {book} its number (1-66), {book2} two digits, {chapter} / {chapter2} / {chapter3} the chapter.')}
        </ThemedText>
        <Field
          value={template}
          onChangeText={setTemplate}
          placeholder="https://example.com/audio/{BOOK}_{chapter3}.mp3"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {!valid && (
          <ThemedText type="small" themeColor="danger">
            {t('The link must start with http:// or https:// and contain {chapter}, {chapter2} or {chapter3}.')}
          </ThemedText>
        )}
        {template.trim() && valid ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {t('{chapter}: {url}', { chapter: bookChapterTitle(books, sample) || '…', url: fillTemplate(template.trim(), sample) })}
          </ThemedText>
        ) : null}
        <Field
          value={timingsUrl}
          onChangeText={setTimingsUrl}
          placeholder={t('Verse timings link (optional), e.g. https://example.com/audio/{BOOK}_{chapter3}.json')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={styles.buttons}>
          <Button icon={Icons.save} title={t('Save')} disabled={!changed || !valid} onPress={save} />
          <Button kind="plain" icon={Icons.play} title={t('Play this chapter')} disabled={changed} onPress={test} />
        </View>
      </View>

      {localAudioSupported ? (
        <>
          <SectionHeader title={t('On this device')} />
          <View style={styles.block}>
            {progress ? (
              <View style={styles.status}>
                <ActivityIndicator />
                <ThemedText type="small" style={styles.fill}>
                  {t('Downloading… {done} of {total} chapters', { done: progress.done, total: progress.total })}
                  {progress.failed ? ` · ${t('{count} failed', { count: progress.failed })}` : ''}
                </ThemedText>
                <IconButton icon={Icons.close} label={t('Cancel download')} color={theme.danger} onPress={() => cancelAudioDownload(versionId)} />
              </View>
            ) : (
              <>
                <ThemedText type="small" themeColor="textSecondary">
                  {source.template
                    ? t('Download chapters from the link to listen without the internet, or import audio files you have.')
                    : t('Import audio files you have (named like JHN_3.mp3, 43_3.mp3 or JHN03.mp3), or save a link above to download.')}
                </ThemedText>
                <View style={styles.buttons}>
                  {source.template && bookInfo ? (
                    <Button
                      kind="plain"
                      icon={Icons.download}
                      title={t('Download {book}', { book: bookInfo.name })}
                      disabled={changed}
                      onPress={downloadBook}
                    />
                  ) : null}
                  {source.template && books ? (
                    <Button kind="plain" icon={Icons.download} title={t('Download all')} disabled={changed} onPress={downloadAll} />
                  ) : null}
                  <Button kind="plain" icon={Icons.folder} title={busy ? t('Importing…') : t('Import files')} disabled={busy} onPress={importFiles} />
                  {stats.chapters > 0 && <Button kind="danger" icon={Icons.trash} title={t('Delete files')} onPress={remove} />}
                </View>
              </>
            )}
          </View>
        </>
      ) : (
        <View style={styles.block}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('In the browser audio plays from the link only; downloading and importing audio files is in the phone app.')}
          </ThemedText>
        </View>
      )}
    </>
  );
}

function Listening() {
  const t = useT();
  const theme = useTheme();
  const [continuePlaying, setContinue] = useSetting(settings.audioContinue);
  const [audioRate] = useSetting(settings.audioRate);
  const [ttsRate, setTtsRate] = useSetting(settings.ttsRate);
  const [voice, setVoice] = useSetting(settings.ttsVoice);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [allVoices, setAllVoices] = useState(false);
  const version = useCurrentVersion();
  const language = (version?.locale ?? 'en').split(/[-_]/)[0].toLowerCase();

  useEffect(() => {
    if (speechAvailable()) getVoices().then(setVoices, () => setVoices([]));
  }, []);

  const matching = voices?.filter((v) => allVoices || v.language.toLowerCase().startsWith(language)) ?? [];
  matching.sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));
  const rateOptions = RATES.map((r) => ({ value: String(r), label: `${r}×` }));

  return (
    <>
      <SectionHeader title={t('Listening')} />
      <SwitchRow
        title={t('Continue with the next chapter')}
        subtitle={t('When a chapter ends, play the next one.')}
        value={continuePlaying}
        onChange={setContinue}
      />
      <View style={styles.block}>
        <ThemedText type="smallBold">{t('Audio speed')}</ThemedText>
        <Segmented
          options={rateOptions}
          value={String(audioRate)}
          onChange={(v) => {
            // through playback so a playing chapter changes speed at once
            if (currentRate() !== Number(v)) settings.audioRate.set(Number(v));
            setRate(Number(v));
          }}
        />
      </View>
      {speechAvailable() || Platform.OS === 'web' ? (
        <>
          <SectionHeader title={t('Read aloud')} />
          <View style={styles.block}>
            <ThemedText type="smallBold">{t('Reading speed')}</ThemedText>
            <Segmented options={rateOptions} value={String(ttsRate)} onChange={(v) => setTtsRate(Number(v))} />
          </View>
          <Row
            title={t('Default voice')}
            subtitle={t('The phone’s voice for the language of the version')}
            onPress={() => setVoice('')}
            right={voice === '' ? <Icon name={Icons.check} color={theme.tint} /> : undefined}
          />
          {matching.map((v) => (
            <Row
              key={v.identifier}
              title={v.name}
              subtitle={v.language}
              onPress={() => setVoice(v.identifier)}
              right={voice === v.identifier ? <Icon name={Icons.check} color={theme.tint} /> : undefined}
            />
          ))}
          {voices && (
            <View style={styles.block}>
              {!matching.length && (
                <ThemedText type="small" themeColor="textSecondary">
                  {allVoices
                    ? t('No voices are installed.')
                    : t('No voice for {language} is installed. Voices can be added in the phone’s text-to-speech settings.', { language })}
                </ThemedText>
              )}
              <Button kind="plain" title={allVoices ? t('Show voices for this language') : t('Show all voices')} onPress={() => setAllVoices(!allVoices)} />
            </View>
          )}
        </>
      ) : null}
    </>
  );
}

function OrphanRow({ versionId }: { versionId: string }) {
  const theme = useTheme();
  const t = useT();
  const stats = audioStats(versionId);
  const remove = () =>
    confirm({ title: t('Delete the audio files of {name}?', { name: versionId }), confirmText: t('Delete'), destructive: true }).then(
      (ok) => ok && deleteAudio(versionId),
    );
  return (
    <Row
      left={<Icon name={Icons.music} size={18} />}
      title={versionId}
      subtitle={t('{count} chapters on this device · {size}', { count: stats.chapters, size: formatSize(stats.size) })}
      right={<IconButton icon={Icons.trash} label={t('Delete files')} color={theme.danger} onPress={remove} />}
    />
  );
}

function formatSize(bytes: number) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const styles = StyleSheet.create({
  content: { maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', paddingBottom: Spacing.six },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  status: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  fill: { flex: 1 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
