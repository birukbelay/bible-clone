import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import type { ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type IconName = { ios: SFSymbol; md: AndroidSymbol };

/** SF Symbol on iOS, Material Symbol on Android/web. */
export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const theme = useTheme();
  return <SymbolView name={{ ios: name.ios, android: name.md, web: name.md }} size={size} tintColor={color ?? theme.text} />;
}

export const Icons = {
  book: { ios: 'book', md: 'menu_book' },
  topic: { ios: 'lightbulb', md: 'lightbulb' },
  search: { ios: 'magnifyingglass', md: 'search' },
  library: { ios: 'books.vertical', md: 'collections_bookmark' },
  settings: { ios: 'gearshape', md: 'settings' },
  bookmark: { ios: 'bookmark', md: 'bookmark_border' },
  bookmarkFill: { ios: 'bookmark.fill', md: 'bookmark' },
  note: { ios: 'square.and.pencil', md: 'edit_note' },
  tag: { ios: 'tag', md: 'sell' },
  highlight: { ios: 'highlighter', md: 'ink_highlighter' },
  copy: { ios: 'doc.on.doc', md: 'content_copy' },
  share: { ios: 'square.and.arrow.up', md: 'share' },
  study: { ios: 'character.book.closed', md: 'translate' },
  link: { ios: 'link', md: 'link' },
  trash: { ios: 'trash', md: 'delete' },
  close: { ios: 'xmark', md: 'close' },
  add: { ios: 'plus', md: 'add' },
  check: { ios: 'checkmark', md: 'check' },
  left: { ios: 'chevron.left', md: 'chevron_left' },
  right: { ios: 'chevron.right', md: 'chevron_right' },
  down: { ios: 'chevron.down', md: 'expand_more' },
  up: { ios: 'chevron.up', md: 'expand_less' },
  notes: { ios: 'text.bubble', md: 'notes' },
  download: { ios: 'arrow.down.circle', md: 'download' },
  sync: { ios: 'arrow.triangle.2.circlepath', md: 'sync' },
  more: { ios: 'ellipsis.circle', md: 'more_vert' },
  textLarger: { ios: 'textformat.size.larger', md: 'text_increase' },
  textSmaller: { ios: 'textformat.size.smaller', md: 'text_decrease' },
  open: { ios: 'arrow.up.right', md: 'north_east' },
  file: { ios: 'square.and.arrow.down', md: 'upload_file' },
  play: { ios: 'play.fill', md: 'play_arrow' },
  pause: { ios: 'pause.fill', md: 'pause' },
  menu: { ios: 'line.3.horizontal', md: 'menu' },
  split: { ios: 'rectangle.split.2x1', md: 'vertical_split' },
  splitOn: { ios: 'rectangle.split.2x1.fill', md: 'view_column' },
  moreVertical: { ios: 'ellipsis', md: 'more_vert' },
  pencil: { ios: 'pencil', md: 'edit' },
  translate: { ios: 'character.book.closed', md: 'translate' },
  goTo: { ios: 'book.pages', md: 'auto_stories' },
  fullscreen: { ios: 'arrow.up.left.and.arrow.down.right', md: 'fullscreen' },
  fullscreenExit: { ios: 'arrow.down.right.and.arrow.up.left', md: 'fullscreen_exit' },
  plan: { ios: 'calendar', md: 'event_note' },
  flame: { ios: 'flame', md: 'local_fire_department' },
  folder: { ios: 'folder', md: 'folder' },
  refresh: { ios: 'arrow.clockwise', md: 'refresh' },
  bell: { ios: 'bell', md: 'notifications' },
  language: { ios: 'globe', md: 'language' },
  circle: { ios: 'circle', md: 'radio_button_unchecked' },
  checkCircle: { ios: 'checkmark.circle.fill', md: 'check_circle' },
} satisfies Record<string, IconName>;
