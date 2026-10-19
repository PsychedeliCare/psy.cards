# psy.cards Android

Native Jetpack Compose app (Material 3, Navigation 3) with the same
two-sided substance cards as the web and iOS apps, from the same data.

## Requirements

- Android SDK with platform 36 (`compileSdk = 36`, `minSdk = 26`)
- JDK 17+ (Android Studio's bundled JBR works)

## Build & test

From the repo root:

```bash
pnpm datapack
pnpm android:build
pnpm android:test
```

Or open `packages/android` in Android Studio. Gradle reads the SDK location
from `local.properties` (`sdk.dir=…`) or `ANDROID_HOME`.

## Data pack

`pnpm datapack` (`packages/shared/scripts/build-datapack.mjs`) writes, per
locale, `app/src/main/assets/datapack/<locale>/{substances,combos,cards,meta,ui}.json`,
the Phosphor icons as vector drawables (`res/drawable/ph_*.xml`,
`status_*.xml`) and `generated/GeneratedAssets.kt`, which maps icon and
molecule names to resource ids. Molecule structures come from
`render-molecules.mjs` (`res/drawable-nodpi/molecule_*.png`).

UI strings come from `ui.json` (the shared i18n JSON, flattened) through
`DataPack.t()`, with named `{placeholders}`, exactly like the web's `t()`.
The UI language is the per-app locale (Android 13+ system picker, or the
in-app picker via `AppCompatDelegate.setApplicationLocales`).

## Structure

- `data/` — data pack models and loading, body profile, dose maths
- `ui/card/` — card deck (3D flip, swipe), faces, charts, hologram, body dock
- `ui/substance/` — card + details, timing chart
- `ui/list/`, `ui/wheel/`, `ui/combos/`, `ui/settings/` — top-level screens
- `ui/PsyCardsApp.kt` — adaptive navigation (bottom bar / rail) with one
  Navigation 3 back stack per tab

## Deep links

`psycards://<slug>` opens a card, mirroring `https://psy.cards/<slug>`
(also `psycards://<locale>/<slug>` and `psycards://combos`):

```bash
adb shell am start -a android.intent.action.VIEW -d psycards://mdma cards.psy.app
```

Compose test tags are exposed as resource ids, so UI Automator / Maestro
can target `card-deck`, `side-safety`, `dock-plus`, `row-<slug>`, …
