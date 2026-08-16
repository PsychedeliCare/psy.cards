# psy.cards iOS

Native SwiftUI app for iOS/iPadOS 26 with Liquid Glass.

## Requirements

- Xcode 26+
- iOS/iPadOS 26 SDK
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)

## Generate & build

From repo root:

```bash
pnpm datapack
cd packages/ios
xcodegen generate
xcodebuild -scheme PsyCards -destination 'platform=iOS Simulator,name=iPhone 16' build
```

Open `PsyCards.xcodeproj` in Xcode after generating.
