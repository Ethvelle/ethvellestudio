# Ethvelle Android app (v399)

This directory contains the Capacitor Android wrapper and native adapters. The active HTML source is the uploaded v404 document **Ethvelle_v404_Updates.html**. To fit the GitHub integration's per-request payload limit, its bytes are stored as 74 ordered, lossless transport fragments under `source-v404/`. This is not 74 independently maintained app files: `scripts/assemble-html.mjs` reconstructs the one HTML document and verifies its exact original byte count and SHA-256 before any build proceeds. The build output is a single `www/index.html`.

The older `source-v398/` snapshot is retained only as historical reference; the build no longer reads it.

## Build

GitHub Actions runs on every push to `android-apk` and on manual dispatch. It installs Capacitor 8, reconstructs and integrity-checks the v404 HTML source, generates the Android project, synchronizes plugins, and produces a debug-signed installable APK. The repository connector does not expose the GitHub Actions secrets-write API, so this build uses Android's debug key until a release key is added by the owner.

## Android host setup

The Capacitor identity is `Ethvelle` / `com.ethvelle.app`, with Android minSdk 24, compileSdk 36 and targetSdk 35. The generated manifest explicitly keeps hardware acceleration enabled for the application/activity; the WebView keeps its hardware layer and has `MediaPlaybackRequiresUserGesture=false`. The app loads its local web assets at the HTTPS `localhost` origin.

The launcher icon generator reads the canonical `splashLogoImg` source from the assembled v404 HTML (the same image the page applies to `.home-brand-logo-only`) and generates legacy plus adaptive Android icons. If the remote image cannot be downloaded, it generates a clean blue E lettermark fallback.

Android Back sends Escape/BrowserBack into the website first, closes recognized overlays, exits the editor through the existing `exitEditor()` action, and then returns through the in-app screen navigation stack. Pressing Back on the Home screen exits the app. Hardware acceleration and WebView media playback are configured in the Android-only native wrapper; the browser HTML is not modified for these settings.

Only INTERNET permission is added. File access uses the Android system document picker; no broad storage/media permission is requested.

## First-time Google sign-in setup

1. In Firebase Console → Project settings → Your apps, register an Android app with package name `com.ethvelle.app`.
2. In Firebase Authentication → Sign-in method, enable Google.
3. Add the app signing SHA-1 and SHA-256 fingerprints to the Firebase Android app. For the current fallback build, obtain the debug certificate with `keytool -list -v -alias androiddebugkey -keystore ~/.android/debug.keystore -storepass android -keypass android`. Add the fingerprints of the future release keystore too when signing is switched.
4. Download `google-services.json` and place it at `android-app/google-services.json` on the `android-apk` branch. The workflow copies it to the generated Android app before syncing.
5. Firebase Authentication → Settings → Authorized domains: add `localhost` for the email/password Web SDK running at the Capacitor origin.
6. Re-run the Android workflow. The native Google provider uses the Firebase Authentication Capacitor plugin with `skipNativeAuth: true`, then signs the returned Google credential into the existing Firebase JS Auth instance.

## Install on your Android phone

1. Open the APK Release link from the GitHub Actions release.
2. Download `Ethvelle-v399.apk` to your phone.
3. Open the downloaded APK. When Android blocks it, choose Settings and enable **Allow from this source** for the browser or file manager you used.
4. Return to the installer and tap **Install**. This debug-signed build can install as a fresh app. A later build signed with a different key cannot update this app in place; uninstalling first removes its private app data, so export an Ethvelle backup before uninstalling.

## Signing

A debug-signed APK installs on Android, but it is not the permanent production signing identity. Before distributing future production builds, create a release keystore, back up the keystore file and passwords securely, then add GitHub Actions secrets `ETHVELLE_KEYSTORE_BASE64`, `ETHVELLE_KEYSTORE_PASSWORD`, `ETHVELLE_KEY_ALIAS`, and `ETHVELLE_KEY_PASSWORD`. The workflow is prepared to use those secrets when available. Never commit the keystore or passwords. Losing the release key prevents updating apps signed with that key.

## Data and media

The native app is intended to use the Android system picker with persistent read permission. Timeline media references should retain only document metadata and content URI; the original media is not copied into app storage. Project JSON, model assets, and supported IndexedDB data are intended to be backed by files under Capacitor `Directory.Data`; each project should have its own JSON file with temp-file + atomic rename writes.

Use the in-app Backup / Restore controls to move browser projects into the app. Legacy browser Blob/data-URL timeline media may need to be selected again because a browser blob cannot become a durable Android document URI automatically. The Diagnostics screen is intended to check linked file permissions and report missing files.

Exports are intended to be written to Movies/Ethvelle and shareable. No broad storage permission should be requested. The exact native behaviors still require code review and Android device testing.

## Limits

The build can be checked in GitHub Actions, but no physical Android device is available in this environment. Large-file decode/seek, canvas export, native Google sign-in after Firebase setup, and file-provider edge cases still need on-device verification.
