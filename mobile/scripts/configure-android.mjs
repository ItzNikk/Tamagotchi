import fs from 'node:fs';
import path from 'node:path';

const mobileDir = process.cwd();
const androidDir = path.join(mobileDir, 'android');
const appDir = path.join(androidDir, 'app');
const javaPkgDir = path.join(
  appDir,
  'src',
  'main',
  'java',
  'com',
  'itznikk',
  'tamagotchi',
);
const manifestPath = path.join(appDir, 'src', 'main', 'AndroidManifest.xml');
const filePathsXml = path.join(
  appDir,
  'src',
  'main',
  'res',
  'xml',
  'file_paths.xml',
);
const buildGradlePath = path.join(appDir, 'build.gradle');

const version = (process.env.VERSION || '0.1.0').trim().replace(/^v/i, '');
const [major, minor, patch] = version
  .split('-')[0]
  .split('.')
  .map((n) => Number.parseInt(n, 10) || 0);

// Strictly increasing deterministic versionCode derived from semver (prevents downgrade errors)
const versionCode = Math.max(1, major * 1000000 + minor * 1000 + patch);

// 1. Copy native ApkUpdaterPlugin.java and MainActivity.java
fs.mkdirSync(javaPkgDir, { recursive: true });
fs.copyFileSync(
  path.join(mobileDir, 'android-native', 'ApkUpdaterPlugin.java'),
  path.join(javaPkgDir, 'ApkUpdaterPlugin.java'),
);
fs.copyFileSync(
  path.join(mobileDir, 'android-native', 'MainActivity.java'),
  path.join(javaPkgDir, 'MainActivity.java'),
);

// 2. Ensure REQUEST_INSTALL_PACKAGES permission is declared in AndroidManifest.xml
let manifest = fs.readFileSync(manifestPath, 'utf8');
if (!manifest.includes('android.permission.REQUEST_INSTALL_PACKAGES')) {
  manifest = manifest.replace(
    '</manifest>',
    '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />\n</manifest>',
  );
  fs.writeFileSync(manifestPath, manifest, 'utf8');
}

// 3. Expose cache/updates/ through Capacitor's existing FileProvider paths
fs.mkdirSync(path.dirname(filePathsXml), { recursive: true });
if (fs.existsSync(filePathsXml)) {
  let xml = fs.readFileSync(filePathsXml, 'utf8');
  if (!xml.includes('path="updates/"')) {
    xml = xml.replace(
      '</paths>',
      '    <cache-path name="apk_updates" path="updates/" />\n</paths>',
    );
    fs.writeFileSync(filePathsXml, xml, 'utf8');
  }
} else {
  fs.writeFileSync(
    filePathsXml,
    `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="apk_updates" path="updates/" />
</paths>
`,
    'utf8',
  );
}

// 4. Configure consistent signing keystore (prevents "App not installed" signature mismatch on updates)
const customKeystore = process.env.ANDROID_KEYSTORE_PATH || '';
const fallbackKeystore = path.resolve(
  mobileDir,
  'android-signing',
  'tamagotchi-open.p12',
);
const keystoreFile = customKeystore && fs.existsSync(customKeystore)
  ? path.resolve(customKeystore)
  : fallbackKeystore;

if (!fs.existsSync(keystoreFile)) {
  throw new Error(`Android signing keystore not found at ${keystoreFile}`);
}

const isPkcs12 = keystoreFile.toLowerCase().endsWith('.p12');
const storePassword = process.env.ANDROID_KEYSTORE_PASSWORD || 'android';
const keyAlias = process.env.ANDROID_KEY_ALIAS || 'androiddebugkey';
const keyPassword = process.env.ANDROID_KEY_PASSWORD || 'android';

// Copy keystore inside android/app/ so Gradle resolves it reliably on any runner path
const targetKeystoreName = isPkcs12 ? 'release-signing.p12' : 'release-signing.jks';
fs.copyFileSync(keystoreFile, path.join(appDir, targetKeystoreName));

let gradle = fs.readFileSync(buildGradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);

const signingBlock = `    signingConfigs {
        release {
            storeFile file("${targetKeystoreName}")
            ${isPkcs12 ? 'storeType "PKCS12"' : ''}
            storePassword "${storePassword.replace(/"/g, '\\"')}"
            keyAlias "${keyAlias.replace(/"/g, '\\"')}"
            keyPassword "${keyPassword.replace(/"/g, '\\"')}"
            enableV1Signing true
            enableV2Signing true
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release`;

if (!gradle.includes('signingConfigs {')) {
  const releaseBlockRegex = /buildTypes\s*\{\s*release\s*\{/;
  if (!releaseBlockRegex.test(gradle)) {
    throw new Error('Could not locate buildTypes { release { in android/app/build.gradle');
  }
  gradle = gradle.replace(releaseBlockRegex, signingBlock);
}

fs.writeFileSync(buildGradlePath, gradle, 'utf8');

// 5. Apply Tamagotchi PNG icon across Android launcher mipmaps if present
const sourceIcon = path.resolve(mobileDir, '..', 'public', 'pwa-512x512.png');
if (fs.existsSync(sourceIcon)) {
  const resDir = path.join(appDir, 'src', 'main', 'res');
  const mipmapDirs = [
    'mipmap-mdpi',
    'mipmap-hdpi',
    'mipmap-xhdpi',
    'mipmap-xxhdpi',
    'mipmap-xxxhdpi',
  ];
  for (const dirName of mipmapDirs) {
    const dir = path.join(resDir, dirName);
    if (fs.existsSync(dir)) {
      for (const fileName of [
        'ic_launcher.png',
        'ic_launcher_round.png',
        'ic_launcher_foreground.png',
      ]) {
        const dest = path.join(dir, fileName);
        if (fs.existsSync(dest)) {
          fs.copyFileSync(sourceIcon, dest);
        }
      }
    }
  }
}

console.log(
  `Configured Android native updater, FileProvider, consistent signing (${targetKeystoreName}), versionName=${version}, versionCode=${versionCode}`,
);
