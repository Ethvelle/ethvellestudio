# Ethvelle Android APK project (v365)

This folder packages the uploaded `Ethvelle_v365_Character_Voices.html` editor in an Android WebView and adds a native Android Storage Access Framework (SAF) picker for selected image, video and audio files.

## Android file access

- The v365 editor HTML is saved in `source-parts/` as numbered text chunks because the original single HTML file is large. GitHub Actions joins them, in filename order, into `app/src/main/assets/index.html` before compiling.
- The APK starts the editor from its bundled local asset, so the editor shell does not require the website host to load.
- Media imported through the Android-native media action is stored as a persisted Android `content://` URI reference plus metadata. The selected media bytes are not copied into IndexedDB by this import path.
- The native Activity exposes the URI through an app-local HTTPS URL and streams byte ranges, allowing supported video players to seek without copying the whole file.
- Standard HTML file inputs continue to use Android's WebView file chooser.
- Project references are specific to this Android installation. On another device, source media must be selected/relinked again. A provider may revoke persisted permission or the original file may be removed.

## Build

The root workflow `.github/workflows/build-android.yml` runs on every push to `main` or `master`, and can also be started from the repository's **Actions** tab using **Build Ethvelle Android APK**.

After a successful run:
1. Open the workflow run.
2. Open **Artifacts**.
3. Download **Ethvelle-Android-APK**.
4. Extract the ZIP and install `app-debug.apk` on Android.

## Toolchain

- Android Gradle Plugin 8.13.2
- Gradle 8.13
- Java 17
- Compile SDK 36
- Minimum Android API 24
- AndroidX WebKit 1.18.0

This workflow produces a debug APK for testing. A Play Store release requires a private signing key and a separate release-signing configuration; signing secrets must not be committed to the repository.
