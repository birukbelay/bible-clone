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

## Web & Vercel

The same app runs in the browser (react-native-web). Everything is served from your own
deployment: no CDN, web fonts or analytics.

- Bible versions and Strong's are copied from `assets/db/` to `public/bibles/` gzipped
  (`scripts/build-web-dbs.mjs`, about 1.7-2.5 MB per version, 4.3 MB for Strong's) and
  downloaded only when first opened, then kept in the browser.
- Notes, tags, highlights, bookmarks and downloaded / imported versions stay in the browser
  (IndexedDB). Clearing the site data removes them.
- It needs `https` or `localhost` (SQLite runs in a web worker with WebAssembly).
- Search uses plain matching instead of SQLite's full-text index, so it is slower than on phones.
- On wide windows the tabs become a rail on the left. Keyboard: `←` / `→` previous / next chapter,
  `F` full screen, `Esc` closes menus, clears the selection or leaves full screen. Right-click
  does what a long press does on phones (e.g. delete a bookmark).

Run locally:

```bash
bun run web                              # dev server
bun run build:web                        # production build into dist/
node scripts/serve-web.mjs dist 8081     # serve dist/ with the headers vercel.json sets
```

Deploy on Vercel: push the repository (with `assets/db/*.db`) to GitHub, import it at
vercel.com/new and set **Root Directory** to `fyn-rn`. `vercel.json` does the rest: it installs
with bun, builds the web databases, exports to `dist/`, rewrites every path to `index.html` and
sets the cross-origin isolation headers (COOP / COEP) SQLite needs plus long-term caching for
hashed files. Or from this folder with the Vercel CLI: `bunx vercel` (preview) / `bunx vercel --prod`.

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
