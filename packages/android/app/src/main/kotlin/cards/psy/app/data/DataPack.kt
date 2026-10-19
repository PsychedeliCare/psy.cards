package cards.psy.app.data

import android.content.res.AssetManager
import kotlinx.serialization.json.Json
import java.text.NumberFormat
import java.util.Locale

/** Locales with a data pack; the UI language picker offers exactly these. */
val SupportedLocales = listOf("en", "fr", "de", "it")

private val json = Json { ignoreUnknownKeys = true }

/**
 * One locale's data pack (substances, combos, cards, UI strings), loaded from
 * `assets/datapack/<locale>/`. Immutable: switching language loads a new one.
 */
class DataPack(
    val locale: String,
    val substancesPack: SubstancesPack,
    val combosPack: CombosPack,
    val cardsPack: CardsPack,
    val meta: MetaPack,
    private val strings: Map<String, String>,
) {
    val substances get() = substancesPack.substances
    val groups get() = substancesPack.groups
    val gable get() = cardsPack.gable
    val javaLocale: Locale = Locale.forLanguageTag(locale)

    private val substanceByKey = substances.associateBy { it.key }
    private val substanceBySlug = substances.associateBy { it.slug }
    private val numberFormats = mutableMapOf<Int, NumberFormat>()

    fun groupLabel(key: String) = substancesPack.groupLabels[key] ?: key.replaceFirstChar { it.uppercase() }
    fun substance(key: String) = substanceByKey[key]
    fun substanceBySlug(slug: String) = substanceBySlug[slug]
    fun card(key: String) = cardsPack.cards[key]

    /** UI string from the shared i18n JSON, with named `{placeholders}`. */
    fun t(key: String, vararg vars: Pair<String, String>): String {
        var text = strings[key] ?: key
        for ((name, value) in vars) text = text.replace("{$name}", value)
        return text
    }

    /** Locale-aware number formatting (web `Intl.NumberFormat`). */
    fun number(value: Double, digits: Int = 0): String {
        val format = numberFormats.getOrPut(digits) {
            NumberFormat.getNumberInstance(javaLocale).apply {
                minimumFractionDigits = digits
                maximumFractionDigits = digits
            }
        }
        return format.format(value)
    }

    fun interaction(a: String, b: String) = combosPack.matrix[a]?.get(b) ?: combosPack.matrix[b]?.get(a)

    fun pair(a: String, b: String) = combosPack.pairs.firstOrNull {
        (it.a == a && it.b == b) || (it.a == b && it.b == a)
    }

    fun comboGroups(key: String) = ComboGrouping.groups(key, substances, combosPack.matrix)

    fun search(query: String): List<Substance> {
        val trimmed = query.trim().lowercase(javaLocale)
        if (trimmed.isEmpty()) return substances
        return substances.filter { substance ->
            substance.key.contains(trimmed) || substance.searchTerms.any { it.lowercase(javaLocale).contains(trimmed) }
        }
    }

    companion object {
        fun load(assets: AssetManager, locale: String): DataPack {
            val resolved = locale.takeIf { it in SupportedLocales } ?: "en"
            fun read(name: String) = assets.open("datapack/$resolved/$name.json").bufferedReader().use { it.readText() }
            return fromJson(
                locale = resolved,
                substances = read("substances"),
                combos = read("combos"),
                cards = read("cards"),
                meta = read("meta"),
                ui = read("ui"),
            )
        }

        fun fromJson(locale: String, substances: String, combos: String, cards: String, meta: String, ui: String) = DataPack(
            locale = locale,
            substancesPack = json.decodeFromString(substances),
            combosPack = json.decodeFromString(combos),
            cardsPack = json.decodeFromString(cards),
            meta = json.decodeFromString(meta),
            strings = json.decodeFromString(ui),
        )
    }
}

data class ComboPartner(val key: String, val name: String)

data class ComboStatusGroup(
    val statusKey: String,
    val label: String,
    val icon: String,
    val partners: List<ComboPartner>,
)

object ComboGrouping {
    /** Riskiest first, then low-risk combinations (web SubstanceComboTable). */
    val riskOrder = listOf(
        "serotoninsyndrome", "dangerous", "unsafe", "caution",
        "synergy", "safe", "decrease", "unknown",
    )

    fun groups(key: String, substances: List<Substance>, matrix: Map<String, Map<String, ComboCell>>): List<ComboStatusGroup> {
        val buckets = linkedMapOf<String, ComboStatusGroup>()
        // Partners keep the curated table order, like the web list.
        for (other in substances) {
            if (other.key == key) continue
            val cell = matrix[key]?.get(other.key) ?: matrix[other.key]?.get(key) ?: continue
            val group = buckets[cell.statusKey] ?: ComboStatusGroup(cell.statusKey, cell.label, cell.icon, emptyList())
            buckets[cell.statusKey] = group.copy(partners = group.partners + ComboPartner(other.key, other.label))
        }
        return riskOrder.mapNotNull { buckets[it] }
    }
}
