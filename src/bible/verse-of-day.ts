/** Verse of the day: one of a fixed list of well-known verses, picked by the date (same for everyone). */
import { makeAri } from './ari';

const VERSES = [
  makeAri(18, 46, 1), // Psalm 46:1
  makeAri(42, 3, 16), // John 3:16
  makeAri(19, 3, 5), // Proverbs 3:5
  makeAri(22, 40, 31), // Isaiah 40:31
  makeAri(49, 4, 13), // Philippians 4:13
  makeAri(44, 8, 28), // Romans 8:28
  makeAri(18, 23, 1), // Psalm 23:1
  makeAri(23, 29, 11), // Jeremiah 29:11
  makeAri(5, 1, 9), // Joshua 1:9
  makeAri(39, 11, 28), // Matthew 11:28
  makeAri(18, 119, 105), // Psalm 119:105
  makeAri(22, 41, 10), // Isaiah 41:10
  makeAri(48, 2, 8), // Ephesians 2:8
  makeAri(57, 11, 1), // Hebrews 11:1
  makeAri(45, 13, 4), // 1 Corinthians 13:4
  makeAri(39, 6, 33), // Matthew 6:33
  makeAri(18, 27, 1), // Psalm 27:1
  makeAri(49, 4, 6), // Philippians 4:6
  makeAri(43, 1, 8), // Acts 1:8
  makeAri(61, 4, 8), // 1 John 4:8
  makeAri(24, 3, 22), // Lamentations 3:22
  makeAri(46, 5, 17), // 2 Corinthians 5:17
  makeAri(58, 1, 5), // James 1:5
  makeAri(18, 37, 4), // Psalm 37:4
  makeAri(44, 12, 2), // Romans 12:2
  makeAri(42, 14, 6), // John 14:6
  makeAri(32, 6, 8), // Micah 6:8
  makeAri(18, 91, 1), // Psalm 91:1
  makeAri(59, 5, 7), // 1 Peter 5:7
  makeAri(46, 12, 9), // 2 Corinthians 12:9
  makeAri(42, 16, 33), // John 16:33
];

export function verseOfDay(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return VERSES[day % VERSES.length];
}
