# Ethvelle studio

The repository hosts the Ethvelle editor website and builds its Android app.

## Website

GitHub Pages: https://uttamdas5830-creator.github.io/ethvelle-editor/

The Pages workflow assembles the editor source with the Step 4 browser bridge scripts. Native-only functions use browser fallbacks outside the Android app.

## Android APK

The **Build Ethvelle studio Android APK (Step 4)** workflow runs when the editor or Step 4 sources change, and can also be started manually from the Actions tab.

The workflow builds the Capacitor Android app as **Ethvelle studio**, sets the supplied transparent PNG as its launcher icon, includes device-media linking and on-device project-file storage, and publishes the debug APK as a workflow artifact and GitHub Release.

Latest APK: https://github.com/uttamdas5830-creator/ethvelle-editor/releases/download/ethvelle-studio-latest/Ethvelle-studio.apk

The APK is for direct Android installation/testing and is not signed as a Play Store release. Workflow artifacts are retained for 14 days.

## Native storage behaviour

Selected phone media stays in its original device location and is linked through Android document-provider access. Project JSON data is stored in the app's private files directory. Uninstalling the app removes its private project data.
