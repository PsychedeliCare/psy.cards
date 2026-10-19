# psy.cards iOS

Native SwiftUI app for iOS/iPadOS 26 with Liquid Glass. It shows the same
two-sided substance cards as the web (dose & timing / risks & safety), from
the same data, with the body dock for personalised doses.

## Requirements

- Xcode 26+ (iOS/iPadOS 26 SDK)
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)

## Generate & build

From the repo root:

```bash
pnpm datapack
pnpm ios:generate
cd packages/ios
xcodebuild -scheme PsyCards -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

Open `PsyCards.xcodeproj` in Xcode after generating.

## Data pack

`pnpm datapack` (`packages/shared/scripts/build-datapack.mjs`) writes, per
locale, `Resources/DataPack/<locale>/{substances,combos,cards,meta}.json`,
the `<locale>.lproj/Localizable.strings` UI strings and the Phosphor icons
in `Resources/Assets.xcassets/Phosphor`. Card data mirrors the web's
`getCardData` and reuses the web's dose parser, so numbers match exactly.

UI strings keep named `{placeholders}` and are read through
`DataPackStore.t(_:_:)` from the selected locale's `.lproj`, so the in-app
language picker changes the whole UI, not only the data.

## Tests

```bash
xcodebuild test -scheme PsyCards -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

- `PsyCardsTests`: data pack decoding (every locale), combo grouping,
  personal dose maths, label placement, body profile persistence.
- `PsyCardsUITests`: drives the card (personalise, flip by tap and swipe,
  compare sheet, details, wheel) and attaches a screenshot of each step to
  the result bundle (`xcrun xcresulttool export attachments`).

## Deep links

`psycards://<slug>` opens a card, mirroring `https://psy.cards/<slug>`
(also `psycards://<locale>/<slug>`, `psycards://combos`, `psycards://wheel`).
