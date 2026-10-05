# Fyn Bible (fyn-rn)

Expo / React Native rewrite of the old Fyn Bible Android app.

- **Reader**: several Bible versions (Amharic 1954 and KJV with Strong's are bundled). Supports red letters, Strong's numbers, headings and footnotes. Side drawer with books and chapters (OT/NT tabs, verse of the day), split view with two versions side by side (rows aligned by verse, drag the divider to resize), and a floating bar for previous/next chapter, reading options and auto-scroll. Light / dark / system theme; portrait and landscape.
- **Versions**: download from a catalog JSON on any web server, or import a `.db` file. No accounts or third-party services.
- **Topics**: name a subject ("Wisdom"), attach Hebrew/Greek Strong's numbers (H2451, G4678, …), and see every verse that uses any or all of them.
- **Notes, tags, highlights, bookmarks**: stored in WatermelonDB, ready for sync (see `src/sync`).
- **Study**: Strong's words of a verse, cross references, dictionary entries.

Data formats, schema and the sync plan are in [docs/fyn-rn-data.md](docs/fyn-rn-data.md).

## Run

```bash
bunx expo install expo-sqlite @nozbe/watermelondb expo-clipboard
bunx expo prebuild --clean
bunx expo run:android
```

WatermelonDB is a native module, so the app needs a development build (`expo run:*` or
`eas build --profile development`). It does not run in Expo Go.

## Layout

```
src/app/            screens (expo-router): (tabs)/ reader, topics, search, library, settings; sheets
src/bible/          read-only Bible + Strong's SQLite access, verse markup, references (ari)
src/db/             WatermelonDB schema, models, migrations, write actions, hooks
src/sync/           sync plumbing (SyncBackend interface, no backend yet)
src/settings.ts     per-device preferences
plugins/            config plugin for WatermelonDB's JSI adapter
assets/db/          bundled AMH1954.db, KJV.db, strongs.db (built by ../tools/build_bible_db.py)
```
