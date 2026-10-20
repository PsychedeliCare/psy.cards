package cards.psy.app.data

import android.content.SharedPreferences
import android.content.res.AssetManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.descriptors.PrimitiveKind
import kotlinx.serialization.descriptors.PrimitiveSerialDescriptor
import kotlinx.serialization.encoding.Decoder
import kotlinx.serialization.encoding.Encoder
import kotlinx.serialization.json.Json
import java.text.Collator
import java.util.Locale

/*
 * Country-specific card data (`assets/datapack/local.json`, web
 * `data/local-info.ts`): legal status per substance, emergency numbers and
 * harm reduction organisations. Shared by every locale.
 */

@Serializable
data class LocalInfoPack(val countries: Map<String, CountryInfo>)

@Serializable
data class CountryInfo(
    val country: String,
    val name: String,
    val asOf: String,
    val summary: String? = null,
    val emergency: Emergency,
    val callingForHelp: String? = null,
    val drugChecking: String? = null,
    val substances: Map<String, LegalEntry> = emptyMap(),
    val organisations: List<Organisation> = emptyList(),
) {
    @Serializable
    data class Emergency(
        /** The number to call for an overdose (ambulance, else general). */
        val number: String,
        val general: String? = null,
        val poison: Poison? = null,
        val poisonNote: String? = null,
    )

    @Serializable
    data class Poison(val name: String, val phone: String)
}

@Serializable(with = LegalStatusSerializer::class)
enum class LegalStatus { legal, medical, decriminalised, grey, illegal, unknown }

/** Unknown statuses read as [LegalStatus.unknown] rather than failing the pack. */
object LegalStatusSerializer : KSerializer<LegalStatus> {
    override val descriptor = PrimitiveSerialDescriptor("LegalStatus", PrimitiveKind.STRING)
    override fun deserialize(decoder: Decoder) =
        decoder.decodeString().let { raw -> LegalStatus.entries.firstOrNull { it.name == raw } ?: LegalStatus.unknown }
    override fun serialize(encoder: Encoder, value: LegalStatus) = encoder.encodeString(value.name)
}

@Serializable
data class LegalEntry(
    val status: LegalStatus,
    val note: String? = null,
    val confidence: String? = null,
    val sources: List<LegalSource> = emptyList(),
)

@Serializable
data class LegalSource(val title: String, val url: String? = null)

@Serializable
data class Organisation(
    val id: String,
    val name: String,
    val city: String? = null,
    val scope: String,
    val services: List<String> = emptyList(),
    val url: String? = null,
    val phone: String? = null,
    val substances: List<String> = listOf("all"),
    val featured: Boolean = false,
    val description: Map<String, String> = emptyMap(),
) {
    fun description(locale: String) = description[locale] ?: description["en"]
}

/**
 * The person's country (web `scripts/local-info.ts`): chosen in Settings or
 * on a card, otherwise the device region. Stays on the device.
 */
class LocalInfoStore(
    val countries: Map<String, CountryInfo>,
    private val prefs: SharedPreferences?,
    /** Device regions to fall back on, most relevant first. */
    regions: List<String> = emptyList(),
) {
    var code by mutableStateOf(initialCode(regions))
        private set

    /** Whether the person picked the country (vs. the device region). */
    var isChosen by mutableStateOf(prefs?.getString(STORAGE_KEY, null)?.let { it in countries } ?: false)
        private set

    val current get() = code?.let { countries[it] }

    /** Overdose number: the country's ambulance number, else 112. */
    val emergencyNumber get() = current?.emergency?.number ?: "112"

    private fun initialCode(regions: List<String>): String? {
        prefs?.getString(STORAGE_KEY, null)?.takeIf { it in countries }?.let { return it }
        return regions.map { it.uppercase(Locale.ROOT) }.firstOrNull { it in countries }
    }

    fun setCountry(newCode: String?) {
        code = newCode?.takeIf { it in countries }
        isChosen = code != null
        val editor = prefs?.edit() ?: return
        code?.let { editor.putString(STORAGE_KEY, it) } ?: editor.remove(STORAGE_KEY)
        editor.apply()
    }

    /** The country's name in `locale` (CLDR), else the data's own name. */
    fun name(code: String, locale: Locale): String =
        runCatching { Locale.Builder().setRegion(code).build().getDisplayCountry(locale) }.getOrNull()
            ?.takeIf { it.isNotBlank() && !it.equals(code, ignoreCase = true) }
            ?: countries[code]?.name
            ?: code

    fun sortedCodes(locale: Locale): List<String> {
        val collator = Collator.getInstance(locale)
        return countries.keys.sortedWith(compareBy(collator) { name(it, locale) })
    }

    /**
     * Substance-specific services first, then general ones (not poison
     * centres, which the emergency tile already shows).
     */
    fun organisations(key: String): List<Organisation> {
        val shown = current?.organisations?.filter { "poison-centre" !in it.services } ?: return emptyList()
        val specific = shown.filter { key in it.substances }
        val general = shown.filter { "all" in it.substances }
        return (specific + general).distinct().take(MAX_ORGANISATIONS)
    }

    companion object {
        private const val STORAGE_KEY = "psy.cards:country"
        private const val MAX_ORGANISATIONS = 3
        private val json = Json { ignoreUnknownKeys = true }

        fun decode(raw: String): LocalInfoPack = json.decodeFromString(raw)

        fun load(assets: AssetManager): Map<String, CountryInfo> =
            runCatching { decode(assets.open("datapack/local.json").bufferedReader().use { it.readText() }).countries }
                .getOrDefault(emptyMap())

        /** Regional indicator symbols: "CH" → 🇨🇭. */
        fun flag(code: String) = code.uppercase(Locale.ROOT).map { String(Character.toChars(0x1F1E6 + (it - 'A'))) }.joinToString("")

        /** `tel:` URI with only the dialable characters. */
        fun telUri(number: String) = "tel:${number.filter { it.isDigit() || it == '+' }}"

        /** Authored with the European 112; the local number reaches the ambulance directly. */
        fun localiseEmergency(text: String, number: String) = text.replace(Regex("\\b112\\b"), number)
    }
}
