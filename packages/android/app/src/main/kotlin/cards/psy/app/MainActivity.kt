package cards.psy.app

import android.content.Context
import android.content.Intent
import android.content.res.Resources
import android.net.Uri
import android.os.Bundle
import android.telephony.TelephonyManager
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.edit
import androidx.core.os.LocaleListCompat
import cards.psy.app.data.BodyProfileStore
import cards.psy.app.data.DataPack
import cards.psy.app.data.LocalInfoStore
import cards.psy.app.data.SupportedLocales
import cards.psy.app.ui.BrowseMode
import cards.psy.app.ui.CombosRoute
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalCountry
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.PsyCardsApp
import cards.psy.app.ui.SubstanceRoute
import cards.psy.app.ui.SubstancesRoute
import cards.psy.app.ui.TopLevelBackStack
import cards.psy.app.ui.theme.PsyCardsTheme

/**
 * Single activity. The UI language is the per-app locale (Android 13+ system
 * picker or the in-app one); changing it recreates the activity, which loads
 * that locale's data pack.
 */
class MainActivity : AppCompatActivity() {
    private val pendingLink = mutableStateOf<Uri?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        pendingLink.value = intent?.data

        val locale = (AppCompatDelegate.getApplicationLocales()[0] ?: resources.configuration.locales[0]).language
            .takeIf { it in SupportedLocales } ?: "en"
        val pack = DataPack.load(assets, locale)
        val prefs = getSharedPreferences("psy.cards", Context.MODE_PRIVATE)
        val body = BodyProfileStore(prefs)
        val country = LocalInfoStore(LocalInfoStore.load(assets), prefs, deviceRegions())

        setContent {
            val navigation = remember { TopLevelBackStack(SubstancesRoute) }
            var browseMode by remember { mutableStateOf(runCatching { BrowseMode.valueOf(prefs.getString(BROWSE_KEY, null) ?: "list") }.getOrDefault(BrowseMode.list)) }
            var selectedKey by remember { mutableStateOf(prefs.getString(SELECTED_KEY, null)) }

            pendingLink.value?.let { uri ->
                pendingLink.value = null
                open(uri, pack, navigation) { selectedKey = it }
            }

            CompositionLocalProvider(LocalPack provides pack, LocalBody provides body, LocalCountry provides country) {
                PsyCardsTheme {
                    // Expose test tags to UI Automator (adb / Maestro / macrobenchmarks).
                    androidx.compose.foundation.layout.Box(Modifier.semantics { testTagsAsResourceId = true }) {
                    PsyCardsApp(
                        navigation = navigation,
                        browseMode = browseMode,
                        onBrowseMode = {
                            browseMode = it
                            prefs.edit { putString(BROWSE_KEY, it.name) }
                        },
                        selectedKey = selectedKey,
                        onSelectedKey = {
                            selectedKey = it
                            prefs.edit { putString(SELECTED_KEY, it) }
                        },
                    )
                    }
                }
            }
        }
    }

    /** The system locales' regions (not the per-app locale), then the SIM / network country. */
    private fun deviceRegions(): List<String> {
        val system = Resources.getSystem().configuration.locales
        val telephony = getSystemService(TelephonyManager::class.java)
        return (0 until system.size()).map { system[it].country } +
            listOfNotNull(telephony?.simCountryIso, telephony?.networkCountryIso)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        pendingLink.value = intent.data
    }

    /**
     * `psycards://<slug>` (or `/<locale>/<slug>`, `/combos`) mirrors the web's
     * `psy.cards/<slug>`, so printed QR codes can deep-link into the app.
     */
    private fun open(uri: Uri, pack: DataPack, navigation: TopLevelBackStack, select: (String) -> Unit) {
        val parts = (listOfNotNull(uri.host) + uri.pathSegments).filter { it.isNotBlank() }.toMutableList()
        parts.firstOrNull()?.takeIf { it in SupportedLocales }?.let { locale ->
            parts.removeAt(0)
            if (locale != pack.locale) AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(locale))
        }
        if (parts.firstOrNull() == "card") parts.removeAt(0)
        when (val first = parts.firstOrNull()) {
            null -> Unit
            "combos" -> navigation.select(CombosRoute)
            else -> pack.substanceBySlug(first)?.let {
                select(it.key)
                navigation.select(SubstancesRoute)
                navigation.push(SubstanceRoute(it.key))
            }
        }
    }

    private companion object {
        const val BROWSE_KEY = "substances.browseMode"
        const val SELECTED_KEY = "substances.selected"
    }
}
