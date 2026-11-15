# Ethvelle Editor

The original Ethvelle v287 HTML source is stored in numbered chunks under `site-source/`. GitHub Actions joins the chunks into `index.html` for the website and also copies the complete HTML into the Android APK.

## Website
https://uttamdas5830-creator.github.io/ethvelle-editor/

## Android APK
Open Actions → Build Android APK. Download `Ethvelle-debug-apk` from the workflow run artifacts, or download the `android-latest` prerelease from Releases after a successful build.

## Android app
The APK bundles the complete editor HTML in its Android assets and opens it locally in a WebView, so the editor interface can start without an internet connection. Features that contact online services, load remote resources, or use cloud storage/sign-in still require internet access. The app includes JavaScript, DOM storage, a file picker, and download handling. Google sign-in inside an embedded WebView may be blocked by Google; full native Firebase Google authentication requires additional Android/Firebase setup.

## Important
The original HTML source is not intentionally edited by the deployment workflow. This repository is public, so the website source is public too.
