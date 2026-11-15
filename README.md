# Ethvelle Editor

The original Ethvelle v287 HTML source is stored in numbered chunks under `site-source/` because the source is larger than a comfortable single API upload. GitHub Actions joins the chunks into `index.html` and deploys GitHub Pages.

## Website
After the Pages workflow succeeds: https://uttamdas5830-creator.github.io/ethvelle-editor/

## Android APK
Open Actions → Build Android APK. Download `Ethvelle-debug-apk` from the workflow run artifacts, or download the `android-latest` prerelease from Releases after a successful build.

## Android app
The Android project is a WebView wrapper with JavaScript, DOM storage, and a file picker. It loads the GitHub Pages site. Google sign-in through an embedded WebView may be blocked by Google; full native Firebase Google authentication requires additional Android/Firebase setup.

## Important
The original HTML is not intentionally edited by the deployment workflow. This repository is public, so the website source is public too.
