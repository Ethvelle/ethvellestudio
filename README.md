# Ethvelle Android WebView APK

This repository builds the Ethvelle v439 editor as an installable Android WebView app.

## Direct device media linking

On Android, the editor's Clips, Audio, Background, and Replace media actions open the native Android document picker. Multiple compatible files can be selected in one operation where the Android file provider supports it.

The selected media remains in its original location on the phone. The app stores only a small URI reference and metadata in Android preferences, then exposes the original file through a local HTTPS WebView endpoint with byte-range streaming. It does not copy selected media into IndexedDB, localStorage, app media folders, or Cloudinary. It also skips import-time filmstrip and waveform generation. The editor requests media only when a preview or playback actually needs it.

No broad gallery permission is requested: Android grants access to the files the user explicitly selects. If a linked file is moved, deleted, or access is revoked, that clip will need to be relinked.

## App icon

The Android launcher icon is generated during the GitHub Actions build from the same PNG URL used by the website favicon in the v439 HTML.

## Build with GitHub Actions

The workflow `.github/workflows/build-android.yml` builds a debug APK on pushes to `main` or `master`, and it also supports manual runs.

1. Open the repository's **Actions** tab.
2. Open the latest **Build Ethvelle Android APK** run.
3. When the run succeeds, open **Artifacts**.
4. Download **Ethvelle-Android-APK-v440-Device-Link**.
5. Extract the ZIP and install `app-debug.apk` on Android.

The artifact is retained for 14 days.

## Build locally

Open the `android/` folder in Android Studio. The project uses Java 17, Gradle 8.13, Android Gradle Plugin 8.13.2, compile SDK 36 and AndroidX WebKit 1.18.0.

## Important notes

- This workflow creates a debug APK for testing, not a Play Store-signed release.
- Linked media must remain accessible through the original Android document provider. The app does not create a second copy.
- Firebase, Cloudinary-hosted site content, fonts and other remote services still need an internet connection.
- The device-link bridge is injected into the Android APK only; the browser website continues to use its normal browser file picker and storage behaviour.
