# Snapboard Mobile

Nexa Forge's local-first idea capture app, ported from the web MVP to React Native with Expo.

## Current product

- Capture title, thought, type, energy and tags
- Search saved snaps
- Delete individual snaps
- Export through the native share sheet
- Local persistence with AsyncStorage
- No account, backend, analytics or paid API
- Android and iOS package IDs: com.nexaforge.snapboard

## Build

Requires Node.js and the Expo CLI.

    npm install
    npx expo start

For a native development build:

    npx expo prebuild
    npx expo run:android
    npx expo run:ios

For store builds with EAS:

    npx eas login
    npx eas build:configure
    npx eas build --platform android --profile production
    npx eas build --platform ios --profile production

## Google Play

The Android build should target API 36 to satisfy the current Google Play new-app requirement. Expo SDK 57 currently targets Android API 36.

A new personal Play Console account requires a closed test with at least 12 opted-in testers continuously for 14 days before production access.

## Apple

Apple Developer membership and App Store Connect setup are required for iOS distribution. The bundle identifier is preconfigured as com.nexaforge.snapboard.

## Release checklist

- Run eas init and record the generated EAS project ID
- Add final app icon/splash assets
- Add store screenshots
- Create privacy policy URL
- Complete Google Play Data safety and content declarations
- Complete Apple privacy details and age rating
- Run Android/iOS device QA
- Create Google Play closed test
- Create TestFlight build
- Submit for review
