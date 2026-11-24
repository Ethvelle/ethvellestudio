import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const android = path.join(root, 'android');
const src = path.join(root, 'src-native');
const javaOut = path.join(android, 'app/src/main/java/com/ethvelle/app');
await fs.mkdir(javaOut, { recursive: true });
for (const name of ['MainActivity.java', 'EthvelleMediaPlugin.java', 'EthvelleStoragePlugin.java']) {
  const sourcePath = name === 'MainActivity.java'
    ? path.join(src, name)
    : path.join(src, 'java', 'com', 'ethvelle', 'app', name);
  const source = await fs.readFile(sourcePath, 'utf8');
  await fs.writeFile(path.join(javaOut, name), source, 'utf8');
}

const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
let manifest = await fs.readFile(manifestPath, 'utf8');
manifest = manifest.replace(/<manifest([^>]*)>/, (m, attrs) => {
  // No broad external-storage permissions are added. SAF handles user-selected files.
  return '<manifest' + attrs + '>';
});
if (!manifest.includes('android.permission.INTERNET')) manifest = manifest.replace('<application', '<uses-permission android:name="android.permission.INTERNET" />\n    <application');
manifest = manifest.replace(/android:name="[^"]*MainActivity"/, 'android:name="com.ethvelle.app.MainActivity"');
manifest = manifest.replace(/android:label="[^"]*"/, 'android:label="Ethvelle"');
manifest = manifest.replace('<application', '<application android:hardwareAccelerated="true"');
manifest = manifest.replace(/<activity([^>]*)>/, '<activity$1 android:hardwareAccelerated="true" android:windowSoftInputMode="adjustResize">');
if (!manifest.includes('androidx.core.content.FileProvider')) {
  manifest = manifest.replace('</application>', `
        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="com.ethvelle.app.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/ethvelle_file_paths" />
        </provider>
    </application>`);
}
await fs.writeFile(manifestPath, manifest, 'utf8');

const res = path.join(android, 'app/src/main/res');
const xml = path.join(res, 'xml');
await fs.mkdir(xml, { recursive: true });
await fs.writeFile(path.join(xml, 'ethvelle_file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-files-path name="ethvelle_exports" path="Movies/Ethvelle/" />
</paths>`, 'utf8');

const varsPath = path.join(android, 'variables.gradle');
let vars = await fs.readFile(varsPath, 'utf8');
function setVar(name, value) {
  const re = new RegExp('(' + name + '\\s*=\\s*)[^\\n]+');
  if (re.test(vars)) vars = vars.replace(re, '$1' + value);
  else vars = vars.replace(/ext\\s*\\{/, match => match + '\\n    ' + name + ' = ' + value);
}
setVar('minSdkVersion', '24');
setVar('compileSdkVersion', '36');
setVar('targetSdkVersion', '35');
if (!/rgcfaIncludeGoogle/.test(vars)) vars = vars.replace(/ext\\s*\\{/, m => m + "\\n    rgcfaIncludeGoogle = true");
if (!/androidxCredentialsVersion/.test(vars)) vars = vars.replace(/ext\\s*\\{/, m => m + "\\n    androidxCredentialsVersion = '1.3.0'");
await fs.writeFile(varsPath, vars, 'utf8');

const appGradle = path.join(android, 'app/build.gradle');
let gradle = await fs.readFile(appGradle, 'utf8');
gradle = gradle.replace(/applicationId\s+['"][^'"]+['"]/, "applicationId 'com.ethvelle.app'");
gradle = gradle.replace(/versionCode\s+\d+/, 'versionCode 399');
gradle = gradle.replace(/versionName\s+['"][^'"]+['"]/, "versionName '399'");
gradle = gradle.replace(/minifyEnabled\s+true/, 'minifyEnabled false');
gradle += `
\n// Firebase Google sign-in configuration is optional for the first build.
if (file('google-services.json').exists()) {
    apply plugin: 'com.google.gms.google-services'
}
`;
await fs.writeFile(appGradle, gradle, 'utf8');

const rootGradle = path.join(android, 'build.gradle');
let rootBuild = await fs.readFile(rootGradle, 'utf8');
if (!rootBuild.includes('com.google.gms:google-services')) {
  if (/buildscript\\s*\\{/.test(rootBuild)) {
    rootBuild = rootBuild.replace(/dependencies\\s*\\{/, match => match + "\\n        classpath 'com.google.gms:google-services:4.4.4'");
  } else {
    rootBuild = "buildscript { repositories { google(); mavenCentral() } dependencies { classpath 'com.google.gms:google-services:4.4.4' } }\\n" + rootBuild;
  }
}
await fs.writeFile(rootGradle, rootBuild, 'utf8');

const manifestApp = await fs.readFile(manifestPath, 'utf8');
if (/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/.test(manifestApp)) {
  throw new Error('Unexpected broad storage permission in generated Android manifest.');
}
console.log('Prepared com.ethvelle.app Android host, native plugins and SAF-only manifest.');
