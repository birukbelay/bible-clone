# fyn-rn data formats

Two kinds of storage, kept apart on purpose:

| | What | Where | Synced |
|---|---|---|---|
| **Bible data** | verse text, books, Strong's dictionary, cross refs | read-only SQLite files (`expo-sqlite`) | never; downloaded/bundled |
| **User data** | bookmarks, notes, highlights, tags, topics | WatermelonDB (`userdata.db`) | later, through `src/sync` |
| **Preferences** | current version, position, font size, catalog URL | `expo-sqlite/kv-store` (`src/settings.ts`) | no (per device) |

Every verse is identified by its **ari** everywhere (Bible files, Strong's index, user data):

```
ari = (book << 16) | (chapter << 8) | verse      book 0..65 (0 = Genesis, 39 = Matthew), 66..
```

All versions use KJV versification, so a note written on `0x2b0310` (John 3:16) shows up in
every version. A range is `ari .. ari_end` (inclusive); a single verse has `ari_end = ari`.

### Catholic and Orthodox canons

Books after Revelation have fixed numbers from 66 up, listed in `src/bible/canon.ts`
(`EXTRA_BOOKS`) and in `EXTRA` in `../tools/build_bible_db.py`. Keep the two lists in step:
user data stores the numbers. 66–83 follow the old app's apocrypha part (its `AP` books by `pos`):

| book | | book | | book | |
|---|---|---|---|---|---|
| 66 | 1 Esdras | 76 | Letter of Jeremiah | 86 | Odes |
| 67 | 2 Esdras | 77 | Susanna | 87 | Psalms of Solomon |
| 68 | Tobit | 78 | Baruch | 88 | Daniel (Greek) |
| 69 | Judith | 79 | Wisdom of Solomon | 89 | 1 Meqabyan |
| 70 | Esther (Greek) | 80 | Song of the Three Young Men | 90 | 2 Meqabyan |
| 71 | 1 Maccabees | 81 | Bel and the Dragon | 91 | 3 Meqabyan |
| 72 | 2 Maccabees | 82 | Jubilees | 92 | 4 Baruch |
| 73 | 3 Maccabees | 83 | Enoch | 93 | Laodiceans |
| 74 | Sirach | 84 | 4 Maccabees | | |
| 75 | Prayer of Manasseh | 85 | Psalm 151 | | |

New books get the next free number; never renumber one. A version may also have chapters and
verses the KJV doesn't (Psalm 151 as Psalms 151, Daniel 13–14, Hebrew-numbered verses such as
Malachi 4 → 3:19–24): they are stored as they are. `canonStatus()` / `isExtraVerse()` in
`canon.ts` compare against the KJV's verse counts, and the reader marks them:

- a book after Revelation or a chapter past the KJV's last one gets a notice above the text;
- a verse past the KJV's last verse of its chapter gets an "extra" badge after its number.

Notes and cross references on these aris only show up in versions that have them. The book
drawer and search get a third section (Deuterocanon) when the open version has books ≥ 66.

---

## 1. Bible version file (`<id>.db`, format 1)

Built by `../tools/build_bible_db.py bible <zoe dir> <out.db>` from the old app's data, or by
`build_bible_db.py text <file> <out.db> --id ID --name NAME` from a verse-per-line text (eBible.org
VPL, or "Genesis 1:1<TAB>text"), or by `build_bible_db.py epub <file.epub> <out.db> --id ID --name NAME`
from an e-Bible whose verse numbers are `<span class="ver" id="vBBCCCVVV">` (Zondervan / Lockman
editions such as the Amplified Bible; headings, notes and poetry lines are kept). `build_bible_db.py free <app dir>` builds the bundled public-domain
versions (BSB, WEB, ASV, YLT, WBT) and regenerates `src/bible/bundled.ts`.
Lives at `<documents>/SQLite/bibles/<id>.db`; **the file name must be `info.id` + `.db`**.

```sql
CREATE TABLE info   (key TEXT PRIMARY KEY, value TEXT) WITHOUT ROWID;
CREATE TABLE books  (book INTEGER PRIMARY KEY, name TEXT NOT NULL, abbr TEXT NOT NULL,
                     chapters INTEGER NOT NULL);
CREATE TABLE verses (ari INTEGER PRIMARY KEY, ari_end INTEGER NOT NULL,
                     label TEXT NOT NULL,      -- "16", or "16-17" for merged verses
                     text TEXT NOT NULL,       -- with markup, see below
                     para INTEGER NOT NULL);   -- 1 = starts a paragraph
CREATE TABLE extras (ari INTEGER NOT NULL, kind TEXT NOT NULL,   -- 'title' | 'note'
                     text TEXT NOT NULL);
CREATE INDEX ix_extras_ari ON extras(ari);
CREATE VIRTUAL TABLE verses_fts USING fts5(plain, content='',
                     tokenize='unicode61 remove_diacritics 2');  -- rowid = ari
```

`info` keys:

| key | example | notes |
|---|---|---|
| `id` | `KJV` | unique, used as file name and in user data (`version_id`) |
| `name` | `KJV - Strongs Concordance` | |
| `short_name` | `KJV` | shown in the reader's version pill |
| `locale` | `en`, `am` | |
| `version` | `1954` | free text |
| `fonts` | `default`, `Amharic` | |
| `strongs` | `1` / `0` | `1` = verse text has inline Strong's tags |
| `versification` | `kjv` | only `kjv` is supported |
| `built_at` | `1791161259421` | ms; a catalog entry with a larger value is offered as an update |
| `format` | `1` | the app refuses other values |

Verse text markup (parsed by `src/bible/markup.ts`):

| markup | meaning |
|---|---|
| `@6 … @5` | words of Jesus (red letters) |
| `@9 … @7` | italics (supplied words) |
| `@8` | line break |
| `@0`–`@4` | indent level |
| `@^` | paragraph start |
| `word@[G25@]` | Strong's number of the preceding word (only when `info.strongs = 1`) |

Merged verses (one text for 16–17) are a single row with `ari` = 16, `ari_end` = 17, `label` = `16-17`.

`extras` rows of kind `note` are the translators' notes. The reader shows a small "note" marker
after the verse that expands its notes; the bar above the chapter (or Reading options →
*Expand all notes*) expands every note.

The builders read deuterocanonical books too: `bible` takes the old app's `AP` part, `text`
knows USFM codes (`TOB`, `SIR`, `1MA`, `PS2`, `DAG`, …) and the common English names
(Ecclesiasticus, Prayer of Azariah, Additions to Esther, …). `epub` keeps only BB 01–66, since
editions number the extra books differently.

## 2. Strong's file (`strongs.db`, shared by all versions)

Built by `../tools/build_bible_db.py strongs …`, bundled with the app.

```sql
CREATE TABLE strongs (number TEXT PRIMARY KEY,   -- 'G4678', 'H2451'
                      lemma TEXT, xlit TEXT, pronounce TEXT,
                      description TEXT,          -- may reference other numbers
                      usage TEXT,                -- KJV renderings
                      verses INTEGER, occurrences INTEGER);
CREATE TABLE strongs_verse (strong TEXT NOT NULL, ari INTEGER NOT NULL, cnt INTEGER NOT NULL,
                            PRIMARY KEY (strong, ari)) WITHOUT ROWID;
CREATE TABLE xref (from_start INTEGER NOT NULL, from_end INTEGER NOT NULL,
                   to_start INTEGER NOT NULL, to_end INTEGER NOT NULL, weight INTEGER NOT NULL);
```

`strongs_verse` comes from the tagged KJV, so Strong's search, topics and the Study screen work
in **every** version (including the untagged Amharic text): the app finds aris through the index
and then shows them in whichever version is open.

A topic's verses (`src/bible/strongs.ts` `versesForStrongs`):

```sql
SELECT ari, count(*) AS words, sum(cnt) AS hits FROM strongs_verse
WHERE strong IN ('H2451','H2449','G4678', …)
GROUP BY ari
[HAVING count(*) = <number of words>]      -- mode 'all'
ORDER BY words DESC, ari;
```

## 3. Getting more versions

No accounts or third-party services. There are two ways:

1. **Catalog**: a JSON file on any static host (GitHub Pages, your own server, a LAN machine).
   Enter its URL in Settings → Catalog.
2. **Import**: Settings → Versions → *Import a .db file* (shared from a computer, Telegram, …).

Both go through `installFile()`, which opens the file, checks `info.format = 1`, `id` and
non-empty `books`/`verses`, then moves it into place, replacing an older copy.

Catalog format, either a bare array or `{ "versions": [...] }`:

```json
{
  "versions": [
    {
      "id": "AMH2000",
      "name": "አዲሱ መደበኛ ትርጉም",
      "short_name": "አመት",
      "locale": "am",
      "strongs": false,
      "url": "AMH2000.db",
      "size": 9105408,
      "built_at": 1791161258409,
      "description": "Amharic, 2000"
    }
  ]
}
```

`url` may be relative to the catalog URL. `size` is only used when the server sends no
Content-Length. The downloaded file's `info.id` must equal the entry's `id`.

## 4. User data (WatermelonDB)

Schema in `src/db/schema.ts` (version 1), models in `src/db/models.ts`, every write in
`src/db/actions.ts`. Every table also has WatermelonDB's `id` (random string), `_status`,
`_changed`, and `created_at`/`updated_at`.

| table | columns | notes |
|---|---|---|
| `bookmarks` | `ari`, `ari_end`, `version_id?`, `title?` | |
| `notes` | `ari`, `ari_end`, `version_id?`, `body` | an empty body deletes the note |
| `highlights` | `ari`, `ari_end`, `color` | `color` is an index into `HighlightColors` |
| `tags` | `name`, `color` | `color` is `#rrggbb` |
| `verse_tags` | `tag_id`, `ari`, `ari_end` | many-to-many verse ↔ tag |
| `topics` | `name`, `description?`, `mode` | `mode`: `any` / `all` |
| `topic_strongs` | `topic_id`, `strong`, `note?` | many-to-many topic ↔ Strong's number |

Rules that keep sync working:

- Write only inside `database.write()` (the helpers in `actions.ts` already do).
- Delete with `markAsDeleted()`, never `destroyPermanently()`, so deletions reach other devices.
  Deleting a tag or topic also marks its `verse_tags` / `topic_strongs` rows.
- Schema change: bump `schema.version` **and** add a migration step in `src/db/migrations.ts`.
  Sync is set up with `migrationsEnabledAtVersion: 1`.

## 5. Sync (structure only, no backend yet)

`src/sync/index.ts` wraps WatermelonDB's `synchronize()`. A backend only moves change sets:

```ts
interface SyncBackend {
  id: string;                       // 'google-drive', 'my-server', ...
  name: string;                     // shown in Settings
  isReady(): Promise<boolean>;      // signed in / configured?
  pull(args: { lastPulledAt: number | null; schemaVersion: number; migration: … })
    : Promise<{ changes: SyncDatabaseChangeSet; timestamp: number }>;
  push(args: { changes: SyncDatabaseChangeSet; lastPulledAt: number }): Promise<void>;
}
```

`SyncDatabaseChangeSet` is the WatermelonDB format:

```json
{
  "notes":      { "created": [{ "id": "…", "ari": 2818832, "ari_end": 2818832, "body": "…", "created_at": 0, "updated_at": 0 }],
                  "updated": [],
                  "deleted": ["<id>", "…"] },
  "verse_tags": { "created": [], "updated": [], "deleted": [] }
}
```

To add Google Drive later:

1. Create `src/sync/backends/google-drive.ts` implementing `SyncBackend`. A simple design keeps
   one JSON file in the Drive `appDataFolder`. That file holds every record keyed by table/id
   plus `updated_at` and a server `timestamp`. `pull` returns the records changed since
   `lastPulledAt`; `push` merges the changes and writes the file back.
2. Call `setSyncBackend(googleDrive)` at startup once the user signs in, then `syncNow()`, e.g. on
   app start and after writes (debounced).
3. Settings → Sync already shows the backend, its last sync time, errors, and unsynced changes.

Any other backend (own REST server, WebDAV, a file the user exports/imports) follows the same
steps. The UI and data layer don't change.

## 6. Native setup

- `expo-sqlite` with `enableFTS` (app.json plugin) for the Bible files and preferences.
- `@nozbe/watermelondb` with the JSI SQLite adapter. `plugins/with-watermelondb.js` wires the
  Android JSI module, packaging options and proguard, plus the iOS `simdjson` pod at prebuild.
- 16 KB pages (Android 15+): React Native and Expo libraries are built 16 KB-aligned, but
  WatermelonDB's `android-jsi/build.gradle` doesn't pass `-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON`.
  With NDK 27, `libwatermelondb-jsi.so` then gets 4 KB alignment. The plugin adds that flag from
  the root `build.gradle`. To check a build:
  `unzip -o app-debug.apk 'lib/arm64-v8a/*' -d x && for f in x/lib/arm64-v8a/*.so; do readelf -lW $f | grep -q 'LOAD.*0x1000$' && echo "4 KB: $f"; done`
- Decorators: babel-preset-expo already includes the legacy decorators transform;
  `tsconfig.json` has `experimentalDecorators` and `useDefineForClassFields: false`.
- A development build is needed (`bunx expo run:android`); Expo Go doesn't include WatermelonDB.

## 7. Audio Bible, backups, links

Nothing here uses an account or a third-party service: audio comes from any web server you
choose or from files on the device, and backups are files the user keeps.

### Audio Bible (per version)

A chapter's audio comes from, first match wins (`src/bible/audio.ts`):

1. `<documents>/audio/<versionId>/<BOOK>_<chapter>.mp3` (downloaded or imported, e.g. `JHN_3.mp3`);
2. the version's URL template (`settings.audioSources[versionId].template`), streamed;
3. otherwise the chapter is read aloud by the phone's voice (expo-speech / the browser's
   speechSynthesis); without that, the play button only scrolls the text.

The template is set in Audio Bible (drawer → Audio, or Settings → More) or comes from the
catalog entry:

```json
{ "id": "AMH2000", "…": "…",
  "audio": { "url_template": "audio/AMH2000/{BOOK}_{chapter3}.mp3",
             "timings": "audio/AMH2000/{BOOK}_{chapter3}.json" } }
```

Relative URLs are resolved against the catalog URL. A template the user typed is never
overwritten by the catalog.

| placeholder | John 3 | |
|---|---|---|
| `{BOOK}` | `JHN` | USFM code |
| `{book}` | `43` | book number 1-66 |
| `{book0}` | `42` | book number 0-65 |
| `{book2}` | `43` (Genesis `01`) | book number, two digits |
| `{chapter}` | `3` | |
| `{chapter2}` | `03` | |
| `{chapter3}` | `003` | |

A template must start with `http://` or `https://` and contain a chapter placeholder.

**Verse timings** (optional) let the reader follow the audio verse by verse: a JSON array, in
seconds from the start of the chapter, next to the audio (`JHN_3.json`) or from the `timings`
template:

```json
[{ "verse": 1, "start": 0.0 }, { "verse": 2, "start": 6.4 }]
```

**Importing files** (phone app only): pick any number of `.mp3` / `.m4a` / `.aac` / `.ogg` and
`.json` files. The name must say the book and chapter: `JHN_3.mp3`, `JHN03.mp3`, `JHN 3.mp3`,
`43_3.mp3` (book number 1-66). Other names are skipped and listed.

On the web, audio streams from the template only (the server must allow cross-origin requests
for timings).

### Backup file

Backup & export writes `fyn-bible-backup-<date>.json`:

```json
{
  "app": "fyn-bible",
  "format": 1,
  "schemaVersion": 1,
  "exportedAt": 1791161258409,
  "tables": { "notes": [{ "id": "…", "ari": 2818832, "ari_end": 2818832, "body": "…", "created_at": 0, "updated_at": 0 }], "…": [] },
  "settings": { "theme": "sepia", "fontSize": 18, "history": [], "audioSources": {}, "…": "…" }
}
```

`tables` holds the raw rows of every table in `src/db/schema.ts` (section 4, plus `plans`,
`plan_readings`, `memory_verses`, `prayers`) without WatermelonDB's `_status` / `_changed`.
`settings` holds the keys in `SETTING_KEYS` (`src/backup.ts`); the reading position and folders
stay on the device. A file with a newer `format` or `schemaVersion` is refused. Restore either
**replaces** all user data or **merges** (adds rows whose `id` is not on the device).

### Links to a passage

`app.json` has the scheme `fynbible`; the web build serves every path from `index.html`
(`vercel.json`). `src/app/[...ref].tsx` opens the reader at:

- `fynbible://JHN.3.16`, `fynbible://JHN.3.16-18`
- `https://<site>/JHN.3.16`, `/John/3/16`, `/John+3:16`, `/ዮሐንስ/3/16`
- `?v=<version id>` also switches to that version if it is installed.

Book names are matched in the current version's language first, then English names and USFM
codes. Anything else shows "Page not found".

### Home-screen widget (not built)

A "verse of the day" widget needs native code (Android `AppWidgetProvider`, iOS WidgetKit
extension) and so a config plugin. A future version could add it this way:

- the app writes today's verse (`src/bible/verse-of-day.ts`) to shared storage on start
  (Android `SharedPreferences`, iOS an App Group `UserDefaults`);
- the widget only reads that text and opens `fynbible://<ref>` when tapped;
- no network, no background job.
