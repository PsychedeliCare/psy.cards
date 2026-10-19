package cards.psy.app.ui

import androidx.compose.runtime.staticCompositionLocalOf
import cards.psy.app.data.BodyProfileStore
import cards.psy.app.data.DataPack

/** The current locale's data pack; replaced wholesale when the language changes. */
val LocalPack = staticCompositionLocalOf<DataPack> { error("No data pack provided") }

/** The on-device body profile used to personalise doses. */
val LocalBody = staticCompositionLocalOf<BodyProfileStore> { error("No body profile provided") }
