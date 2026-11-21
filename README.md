# Ethvelle Editor

This repository contains the website source and the Android APK project.

## Website

https://uttamdas5830-creator.github.io/ethvelle-editor/

The existing website deployment workflow and the original website source under `site-source/` are kept in place. They are separate from the new Android package source.

## Android APK (v365)

The current Android project is in `android-apk/`. It packages the v365 HTML editor uploaded for this build and adds an Android Storage Access Framework (SAF) media picker.

For the native Android media-import path, the app stores an Android `content://` URI reference and metadata instead of copying the selected media bytes into IndexedDB. The selected file is streamed to the WebView through an app-local URL with byte-range support for playback and seeking. Files can still become unavailable if the original file is removed or the provider revokes access; exported projects need media to be relinked on another device.

### Get the APK

1. Open **Actions**.
2. Select **Build Ethvelle Android APK**.
3. Open the latest successful run.
4. Download the **Ethvelle-Android-APK** artifact.
5. Extract the ZIP and install `app-debug.apk` on the Android device.

The workflow runs after pushes to `main` or `master`, and can also be started manually from the Actions tab.

This workflow currently creates a debug APK for testing, not a Play Store-signed release. Test media import, playback and seeking on the target Android device before relying on it for production work.
