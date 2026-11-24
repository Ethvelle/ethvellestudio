import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const android = path.join(root, 'android');
const src = path.join(root, 'src-native');
const javaOut = path.join(android, 'app/src/main/java/com/ethvelle/app');

async function copyNativeSources() {
  await fs.mkdir(javaOut, { recursive: true });
  for (const name of ['MainActivity.java', 'EthvelleMediaPlugin.java', 'EthvelleStoragePlugin.java']) {
    const sourcePath = name === 'MainActivity.java'
      ? path.join(src, name)
      : path.join(src, 'java', 'com', 'ethvelle', 'app', name);
    await fs.copyFile(sourcePath, path.join(javaOut, name));
  }
}

function setTagAttribute(tagText, attribute, value) {
  const attr = new RegExp('\\s+' + attribute + '="[^"]*"');
  const replacement = ' ' + attribute + '="' + value + '"';
  return attr.test(tagText) ? tagText.replace(attr, replacement) : tagText.replace(/>$/, replacement + '>');
}

function setGradleVariable(text, name, value) {
  const line = new RegExp('^([\\t ]*' + name + '\\s*=\\s*)[^\\r\\n]+', 'm');
  if (line.test(text)) return text.replace(line, '$1' + value);
  if (!/ext\s*\{/.test(text)) throw new Error('Could not locate ext block for ' + name + '.');
  return text.replace(/ext\s*\{/, match => match + '\n    ' + name + ' = ' + value);
}

async function prepareManifest() {
  const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
  let manifest = await fs.readFile(manifestPath, 'utf8');
  if (!manifest.includes('android.permission.INTERNET')) {
    manifest = manifest.replace(/<application\b/, '<uses-permission android:name="android.permission.INTERNET" />\n    <application');
  }
  manifest = manifest.replace(/<application\b[^>]*>/i, tag => {
    tag = setTagAttribute(tag, 'android:label', 'Ethvelle');
    return setTagAttribute(tag, 'android:hardwareAccelerated', 'true');
  });

  let foundMainActivity = false;
  manifest = manifest.replace(/<activity\b[^>]*>/gi, tag => {
    if (!/android:name="(?:[^"]*\.)?MainActivity"/i.test(tag)) return tag;
    foundMainActivity = true;
    tag = setTagAttribute(tag, 'android:name', 'com.ethvelle.app.MainActivity');
    tag = setTagAttribute(tag, 'android:hardwareAccelerated', 'true');
    return setTagAttribute(tag, 'android:windowSoftInputMode', 'adjustResize');
  });
  if (!foundMainActivity) throw new Error('Capacitor Android manifest has no MainActivity declaration.');

  if (!manifest.includes('androidx.core.content.FileProvider')) {
    manifest = manifest.replace('</application>', '\n        <provider\n' +
      '            android:name="androidx.core.content.FileProvider"\n' +
      '            android:authorities="com.ethvelle.app.fileprovider"\n' +
      '            android:exported="false"\n' +
      '            android:grantUriPermissions="true">\n' +
      '            <meta-data\n' +
      '                android:name="android.support.FILE_PROVIDER_PATHS"\n' +
      '                android:resource="@xml/ethvelle_file_paths" />\n' +
      '        </provider>\n    </application>');
  }

  const forbidden = /android\.permission\.(?:READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE|READ_MEDIA_IMAGES|READ_MEDIA_VIDEO|READ_MEDIA_AUDIO)/;
  if (forbidden.test(manifest)) throw new Error('Broad storage/media permissions are forbidden; use the Android system document picker.');
  if (!/android:hardwareAccelerated="true"/.test(manifest)) throw new Error('Hardware acceleration was not enabled on the Android application.');
  await fs.writeFile(manifestPath, manifest, 'utf8');

  const xml = path.join(android, 'app/src/main/res/xml');
  await fs.mkdir(xml, { recursive: true });
  await fs.writeFile(path.join(xml, 'ethvelle_file_paths.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<paths xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <external-files-path name="ethvelle_exports" path="Movies/Ethvelle/" />\n' +
    '</paths>\n', 'utf8');
}

async function prepareSdkAndAppIdentity() {
  const varsPath = path.join(android, 'variables.gradle');
  let vars = await fs.readFile(varsPath, 'utf8');
  vars = setGradleVariable(vars, 'minSdkVersion', '24');
  vars = setGradleVariable(vars, 'compileSdkVersion', '36');
  vars = setGradleVariable(vars, 'targetSdkVersion', '35');
  if (!/rgcfaIncludeGoogle/.test(vars)) vars = vars.replace(/ext\s*\{/, m => m + '\n    rgcfaIncludeGoogle = true');
  if (!/androidxCredentialsVersion/.test(vars)) vars = vars.replace(/ext\s*\{/, m => m + "\n    androidxCredentialsVersion = '1.3.0'");
  await fs.writeFile(varsPath, vars, 'utf8');

  const appGradlePath = path.join(android, 'app/build.gradle');
  let appGradle = await fs.readFile(appGradlePath, 'utf8');
  appGradle = appGradle.replace(/applicationId\s+['"][^'"]+['"]/, "applicationId 'com.ethvelle.app'");
  appGradle = appGradle.replace(/versionCode\s+\d+/, 'versionCode 399');
  appGradle = appGradle.replace(/versionName\s+['"][^'"]+['"]/, "versionName '399'");
  appGradle = appGradle.replace(/minifyEnabled\s+true/, 'minifyEnabled false');
  if (!appGradle.includes("file('google-services.json').exists()")) {
    appGradle += '\n// Firebase Google sign-in configuration is optional until the owner supplies google-services.json.\n' +
      "if (file('google-services.json').exists()) {\n" +
      "    apply plugin: 'com.google.gms.google-services'\n" +
      '}\n';
  }
  if (!/applicationId\s+['"]com\.ethvelle\.app['"]/.test(appGradle)) throw new Error('Android applicationId was not set to com.ethvelle.app.');
  await fs.writeFile(appGradlePath, appGradle, 'utf8');

  const rootGradlePath = path.join(android, 'build.gradle');
  let rootGradle = await fs.readFile(rootGradlePath, 'utf8');
  if (!rootGradle.includes('com.google.gms:google-services')) {
    if (/buildscript\s*\{/.test(rootGradle)) {
      rootGradle = rootGradle.replace(/dependencies\s*\{/, match => match + "\n        classpath 'com.google.gms:google-services:4.4.4'");
    } else {
      rootGradle = "buildscript { repositories { google(); mavenCentral() } dependencies { classpath 'com.google.gms:google-services:4.4.4' } }\n" + rootGradle;
    }
  }
  await fs.writeFile(rootGradlePath, rootGradle, 'utf8');
}

await copyNativeSources();
await prepareManifest();
await prepareSdkAndAppIdentity();
console.log('Prepared Ethvelle Android: com.ethvelle.app · minSdk 24 · targetSdk 35 · hardware acceleration enabled · SAF-only storage permissions.');
