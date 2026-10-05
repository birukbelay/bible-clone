# Fyn Bible (fyn-rn)

Expo / React Native rewrite of the old Fyn Bible Android app.

- **Reader**: several Bible versions (bundled: Amharic 1954, KJV with Strong's, and the public-domain BSB, WEB, ASV, YLT and Webster once built - see below). Supports red letters, Strong's numbers, headings and footnotes. Side drawer with books and chapters (OT/NT tabs, verse of the day), split view with two versions side by side (rows aligned by verse, drag the divider to resize), and a floating bar for previous/next chapter, reading options and auto-scroll. Full-screen mode hides the header, tab bar and status bar and keeps only the previous / next chapter arrows. Light / dark / system theme; portrait and landscape.
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

## Bundled public-domain versions

BSB, WEB, ASV, YLT and Webster are built from eBible.org / bereanbible.com texts. Run once in
`fyn-rn/` (downloads into `../tools/sources/`, writes `assets/db/*.db` and `src/bible/bundled.ts`):

```bash
python3 ../tools/build_bible_db.py free .
```

Each version adds about 5-8 MB to the app. Rebuild the app afterwards (`bunx expo run:android`).

## Layout

```
src/app/            screens (expo-router): (tabs)/ reader, topics, search, library, settings; sheets
src/bible/          read-only Bible + Strong's SQLite access, verse markup, references (ari)
src/db/             WatermelonDB schema, models, migrations, write actions, hooks
src/sync/           sync plumbing (SyncBackend interface, no backend yet)
src/settings.ts     per-device preferences
plugins/            config plugin for WatermelonDB's JSI adapter
assets/db/          bundled AMH1954.db, KJV.db, BSB/WEB/ASV/YLT/WBT.db, strongs.db (built by ../tools/build_bible_db.py)
```
