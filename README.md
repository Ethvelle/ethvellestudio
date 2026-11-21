# Ethvelle Android APK

This repository builds an Android APK from the current uploaded `Ethvelle_v365_Character_Voices.html` editor.

## Android-native media linking

The APK includes an Android Storage Access Framework (SAF) picker. The editor's supported media import action opens the device picker for an image, video, or audio file. The app requests persistable read permission and saves the selected file's `content://` URI in app preferences.

The editor stores only a small metadata/reference record in IndexedDB for this native import path. The media bytes are not copied into IndexedDB. A local HTTPS WebViewAssetLoader URL streams the original selected file and supports HTTP byte-range requests for playback and seeking when the chosen document provider supports random access.

The browser website remains unchanged and continues to use its existing browser media storage behaviour.

## Source layout

- `android/` contains the Android Studio / Gradle project.
- `android-source-v365/part-*.txt` stores the current v365 HTML in ordered source chunks. The workflow joins the chunks in the correct order before building the APK.
- `.github/workflows/build-android.yml` builds the debug APK automatically on pushes to `main` or `master`, and can also be started manually.

## Download the APK

1. Open the repository's **Actions** tab.
2. Open the latest **Build Ethvelle Android APK** run.
3. When the run succeeds, open **Artifacts** and download **Ethvelle-Android-APK**.
4. Extract the artifact ZIP and install `app-debug.apk` on Android. Android may ask you to allow installation from the browser or file manager used to download it.

## Build locally

Open the `android/` folder in Android Studio. The project uses Java 17, Gradle 8.13, Android Gradle Plugin 8.13.2, compile SDK 36 and AndroidX WebKit 1.18.0.

## Important limits

- This workflow creates a debug APK for testing, not a Play Store-signed release.
- A linked media file remains tied to the Android app installation and its original document provider. If the source file is deleted, moved, or access is revoked, it must be selected again.
- Some document providers do not support persistent URI permission or efficient random access. Large-file playback and seeking should be tested on the target Android phone.
- Firebase/cloud-backed parts of the editor still need an internet connection; only the editor HTML shell is bundled into the APK.
