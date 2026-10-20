package cards.psy.app.ui

import androidx.compose.runtime.staticCompositionLocalOf
import cards.psy.app.data.BodyProfileStore
import cards.psy.app.data.DataPack
import cards.psy.app.data.LocalInfoStore

/** The current locale's data pack; replaced wholesale when the language changes. */
val LocalPack = staticCompositionLocalOf<DataPack> { error("No data pack provided") }

/** The on-device body profile used to personalise doses. */
val LocalBody = staticCompositionLocalOf<BodyProfileStore> { error("No body profile provided") }

/** The person's country: legal status, emergency numbers and local help on the cards. */
val LocalCountry = staticCompositionLocalOf<LocalInfoStore> { error("No local info provided") }
