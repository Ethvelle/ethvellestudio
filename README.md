# Ethvelle Android WebView APK

This repository builds an installable Android WebView wrapper around the uploaded Ethvelle v439 editor HTML.

## What is included

- The v439 HTML editor is bundled inside the APK and loaded on a local HTTPS origin with AndroidX WebViewAssetLoader.
- The app uses the existing Android WebView file chooser for the editor's standard image, video, audio, and other file-upload inputs.
- The app keeps the existing application ID: `com.ethvelle.editor`.
- Android version code is `439` and version name is `4.39.0`.

## Build with GitHub Actions

The workflow `.github/workflows/build-android.yml` builds the debug APK on pushes to `main` or `master`, and it also supports manual runs.

1. Open the repository's **Actions** tab.
2. Open **Build Ethvelle Android APK**.
3. Select the successful v439 run.
4. Under **Artifacts**, download `Ethvelle-Android-APK-v439`.
5. Extract the ZIP and install `app-debug.apk` on Android.

The artifact is retained for 14 days.

## Build locally

Open the `android/` folder in Android Studio. The project uses Java 17, Gradle 8.13, Android Gradle Plugin 8.13.2, compile SDK 36 and AndroidX WebKit 1.18.0.

## Important notes

- This workflow produces a debug APK for testing, not a Play Store-signed release.
- The editor HTML is bundled in the APK. Updating the website source later does not automatically update an already installed APK; build and install a newer APK for those changes.
- Firebase, Cloudinary, fonts, and other remote services still require an internet connection.
- Uploaded media is handled by the WebView's Android file chooser and by the v439 editor's own media flow. Device-specific file permissions and large-media behaviour should be tested on the target phone.
