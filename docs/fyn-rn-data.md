# fyn-rn data formats

Two kinds of storage, kept apart on purpose:

| | What | Where | Synced |
|---|---|---|---|
| **Bible data** | verse text, books, Strong's dictionary, cross refs | read-only SQLite files (`expo-sqlite`) | never; downloaded/bundled |
| **User data** | bookmarks, notes, highlights, tags, topics | WatermelonDB (`userdata.db`) | later, through `src/sync` |
| **Preferences** | current version, position, font size, catalog URL | `expo-sqlite/kv-store` (`src/settings.ts`) | no (per device) |

Every verse is identified by its **ari** everywhere (Bible files, Strong's index, user data):

```
ari = (book << 16) | (chapter << 8) | verse      book 0..65 (0 = Genesis, 39 = Matthew)
```

All versions use KJV versification, so a note written on `0x2b0310` (John 3:16) shows up in
every version. A range is `ari .. ari_end` (inclusive); a single verse has `ari_end = ari`.

---

## 1. Bible version file (`<id>.db`, format 1)

Built by `../tools/build_bible_db.py bible <zoe dir> <out.db>` from the old app's data.
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
