/**
 * Config plugin: installs WatermelonDB's synchronous JSI adapter (Android) and the simdjson pod (iOS).
 * Autolinking only covers WatermelonDB's bridge module; the JSI package has to be wired by hand,
 * which this does at prebuild time so android/ and ios/ stay generated. It also builds the JSI
 * library with 16 KB page alignment.
 *
 * Usage in app.json: "plugins": ["./plugins/with-watermelondb.js"]
 * Options: { "jsi": false } skips the Android JSI setup (src/db/index.ts then falls back to the
 * asynchronous bridge adapter, with a warning).
 */
const fs = require('fs');
const path = require('path');
const {
  createRunOncePlugin,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withPodfile,
  withProjectBuildGradle,
  withSettingsGradle,
} = require('expo/config-plugins');

const TAG = 'watermelondb';

function watermelonDir(projectRoot) {
  return path.dirname(require.resolve('@nozbe/watermelondb/package.json', { paths: [projectRoot] }));
}

/** path of a package dir relative to the given native project dir, with forward slashes */
function relativeTo(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

const withJsiSettingsGradle = (config) =>
  withSettingsGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes(':watermelondb-jsi')) return cfg;
    const androidDir = path.join(cfg.modRequest.projectRoot, 'android');
    const jsiDir = relativeTo(androidDir, path.join(watermelonDir(cfg.modRequest.projectRoot), 'native', 'android-jsi'));
    cfg.modResults.contents += `
// @generated ${TAG}
include ':watermelondb-jsi'
project(':watermelondb-jsi').projectDir = new File(rootProject.projectDir, '${jsiDir}')
`;
    return cfg;
  });

const withJsiAppBuildGradle = (config) =>
  withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (!src.includes(`project(':watermelondb-jsi')`)) {
      src = src.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation project(':watermelondb-jsi') // @generated ${TAG}`);
    }
    if (!src.includes(`'**/libc++_shared.so'`)) {
      src += `
// @generated ${TAG}: both WatermelonDB JSI and React Native ship libc++_shared.so
android {
    packagingOptions {
        pickFirst '**/libc++_shared.so'
    }
}
`;
    }
    cfg.modResults.contents = src;
    return cfg;
  });

// WatermelonDB's android-jsi/build.gradle doesn't pass this flag (React Native and Expo do), so with
// NDK 27 libwatermelondb-jsi.so gets 4 KB LOAD alignment and fails on 16 KB page-size devices
// (Android 15+). NDK 28+ already defaults to 16 KB; the flag is harmless there.
const withJsiPageSize = (config) =>
  withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.contents.includes('ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES')) return cfg;
    cfg.modResults.contents += `
// @generated ${TAG}: 16 KB page alignment for libwatermelondb-jsi.so
subprojects { p ->
  if (p.name == 'watermelondb-jsi') {
    p.plugins.withId('com.android.library') {
      p.android.defaultConfig.externalNativeBuild.cmake.arguments '-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON'
    }
  }
}
`;
    return cfg;
  });

const withJsiMainApplication = (config) =>
  withMainApplication(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes('WatermelonDBJSIPackage')) return cfg;
    const isKotlin = cfg.modResults.language === 'kt';
    const importLine = `import com.nozbe.watermelondb.jsi.WatermelonDBJSIPackage${isKotlin ? '' : ';'}`;
    src = src.replace(/^(package [^\n]+\n)/m, `$1\n${importLine}\n`);
    // Expo's template: PackageList(this).packages.apply { ... }  (Kotlin) or
    // List<ReactPackage> packages = new PackageList(this).getPackages(); (Java)
    const kotlinAnchor = /PackageList\(this\)\.packages\.apply\s*\{/;
    const javaAnchor = /(List<ReactPackage>\s+packages\s*=\s*new PackageList\(this\)\.getPackages\(\);)/;
    if (isKotlin && kotlinAnchor.test(src)) {
      src = src.replace(kotlinAnchor, (m) => `${m}\n          add(WatermelonDBJSIPackage())`);
    } else if (!isKotlin && javaAnchor.test(src)) {
      src = src.replace(javaAnchor, `$1\n      packages.add(new WatermelonDBJSIPackage());`);
    } else {
      console.warn(
        `[${TAG}] Could not find the package list in MainApplication; add WatermelonDBJSIPackage() manually or set { "jsi": false }.`,
      );
    }
    cfg.modResults.contents = src;
    return cfg;
  });

const withJsiProguard = (config) =>
  withDangerousMod(config, [
    'android',
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
      const rule = '-keep class com.nozbe.watermelondb.** { *; }';
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (!current.includes(rule)) fs.writeFileSync(file, `${current}\n# @generated ${TAG}\n${rule}\n`);
      return cfg;
    },
  ]);

const withSimdjsonPod = (config) =>
  withPodfile(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(`pod 'simdjson'`)) return cfg;
    const iosDir = path.join(cfg.modRequest.projectRoot, 'ios');
    const simdjson = relativeTo(
      iosDir,
      path.dirname(require.resolve('@nozbe/simdjson/package.json', { paths: [watermelonDir(cfg.modRequest.projectRoot)] })),
    );
    src = src.replace(
      /(use_expo_modules!\s*\n)/,
      `$1  pod 'simdjson', path: '${simdjson}', modular_headers: true # @generated ${TAG}\n`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });

function withWatermelonDB(config, options = {}) {
  const { jsi = true } = options;
  if (jsi) {
    config = withJsiSettingsGradle(config);
    config = withJsiAppBuildGradle(config);
    config = withJsiPageSize(config);
    config = withJsiMainApplication(config);
    config = withJsiProguard(config);
  }
  config = withSimdjsonPod(config);
  return config;
}

module.exports = createRunOncePlugin(withWatermelonDB, 'with-watermelondb', '1.0.0');
