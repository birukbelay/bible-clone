/** Switch the reader's Bible version, or (slot=split) the second version of the split view. */
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';

import { useSplitVersion, useVersions } from '@/bible/versions';
import { Icon, Icons } from '@/components/icon';
import { Row } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { settings, useSetting } from '@/settings';

export default function VersionPickerScreen() {
  const theme = useTheme();
  const { slot } = useLocalSearchParams<{ slot?: 'split' }>();
  const { versions } = useVersions();
  const [main, setMain] = useSetting(settings.version);
  const split = useSplitVersion();
  const current = slot === 'split' ? split?.id : main;
  const choose = (id: string) => (slot === 'split' ? settings.splitVersion.set(id) : setMain(id));
  return (
    <ScrollView style={{ backgroundColor: theme.background }}>
      {versions.map((v) => (
        <Row
          key={v.id}
          title={v.name}
          subtitle={[v.shortName, v.locale, v.strongs ? "Strong's tagged" : null].filter(Boolean).join(' · ')}
          right={v.id === current ? <Icon name={Icons.check} color={theme.tint} /> : null}
          onPress={() => {
            choose(v.id);
            router.back();
          }}
        />
      ))}
      <Row
        title="Manage versions…"
        left={<Icon name={Icons.download} color={theme.tint} />}
        onPress={() => {
          router.back();
          router.navigate('/settings');
        }}
      />
    </ScrollView>
  );
}
