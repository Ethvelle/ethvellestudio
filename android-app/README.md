# Ethvelle Android app (v399)

This directory contains the Android wrapper and native adapters. The original site remains one HTML source: `source-v398/part-001.txt` through `part-074.txt` are transfer-safe chunks of the uploaded v398 file; `scripts/assemble-html.mjs` joins them in order into the single runtime document `www/index.html`. Browser builds are not modified.

## Build

GitHub Actions runs on every push to `android-apk` and on manual dispatch. It installs Capacitor 8, assembles `www/index.html`, generates the Android project, synchronizes plugins, and produces a debug-signed, installable APK. The repository connector does not expose the GitHub Actions secrets-write API, so this build uses Android's debug key until a release key is added by the owner.

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

The app uses the system Storage Access Framework picker with persistent read permission. Timeline media is referenced by its `content://` URI and exposed to the editor as a same-origin `https://localhost/_media/<id>` URL with byte-range responses. Original timeline files are not copied into app storage. Project JSON, model assets, and the supported IndexedDB databases are backed by files under Capacitor `Directory.Data`; each project has its own JSON file and writes are temp-file + atomic rename.

Use the in-app Backup / Restore controls to move browser projects into the app. Legacy browser Blob/data-URL timeline media cannot be converted to a document URI without selecting the original file again; restored clips are retained with edits and flagged for relinking. The hidden Diagnostics screen checks linked file permissions and reports missing files.

Exports are written to Movies/Ethvelle (MediaStore) and can be shared. No broad storage permission is requested. Only INTERNET is declared.

## Limits

The build can be checked in GitHub Actions, but no physical Android device is available in this environment. Large-file decode/seek, canvas export, native Google sign-in after Firebase setup, and file-provider edge cases still need on-device verification.
