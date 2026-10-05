// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

// Web: open the sheets (passage, version picker, note, ...) as centered dialogs on wide screens
// and bottom sheets on phones, instead of full pages. Read by Expo CLI after this file loads.
process.env.EXPO_UNSTABLE_WEB_MODAL ??= '1';

const config = getDefaultConfig(__dirname);

// expo-sqlite's web worker loads SQLite as WebAssembly
config.resolver.assetExts.push('wasm');

// Same isolation headers as vercel.json, for the dev server (expo-sqlite on the web needs them
// for its synchronous API).
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  middleware(req, res, next);
};

module.exports = config;
