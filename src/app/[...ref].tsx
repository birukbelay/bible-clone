/**
 * Links to a passage: fynbible://JHN.3.16, https://<site>/JHN.3.16-18, /John/3/16, /ዮሐንስ/3/16,
 * optionally ?v=<version id>. Opens the reader there; anything else shows "not found".
 * Real screens always win over this catch-all route.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { parseRef } from '@/bible/parse-ref';
import { getBooks, useAsync } from '@/bible/queries';
import { getVersion, useCurrentVersion } from '@/bible/versions';
import { Button, Empty, Loading } from '@/components/ui';
import { useT } from '@/i18n';
import { settings } from '@/settings';

export default function PassageLink() {
  const t = useT();
  const params = useLocalSearchParams<{ ref?: string | string[]; v?: string }>();
  const current = useCurrentVersion();
  const versionId = params.v && getVersion(params.v) ? params.v : (current?.id ?? '');
  const { data: books, loading } = useAsync(() => getBooks(versionId), [versionId]);
  const text = (Array.isArray(params.ref) ? params.ref : [params.ref ?? ''])
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join(' ')
    .replace(/[_+]/g, ' ')
    .replace(/-(?=\p{L})/gu, ' ');

  // the version's own book names first, then English names and USFM codes
  const ref = loading && !books ? undefined : (parseRef(text, books) ?? parseRef(text));
  const ari = ref?.ari;

  useEffect(() => {
    if (ari == null) return;
    if (params.v && versionId === params.v) settings.version.set(versionId);
    settings.position.set(ari);
    router.replace('/');
  }, [ari, params.v, versionId]);

  if (ref === null) {
    return (
      <Empty title={t('Page not found')} message={t('“{text}” is not a page or a Bible reference.', { text })}>
        <Button title={t('Open the Bible')} onPress={() => router.replace('/')} />
      </Empty>
    );
  }
  return <Loading />;
}
