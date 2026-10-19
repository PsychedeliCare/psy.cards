package cards.psy.app.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/*
 * Mirrors the data pack written by packages/shared/scripts/build-datapack.mjs
 * (the same files the iOS app decodes).
 */

@Serializable
data class SubstancesPack(
    val locale: String,
    val groups: List<String>,
    val groupLabels: Map<String, String>,
    val substances: List<Substance>,
)

@Serializable
data class Substance(
    val key: String,
    val slug: String,
    val label: String,
    val prettyName: String,
    val group: String,
    val aliases: List<String> = emptyList(),
    val listAliases: List<String> = emptyList(),
    val listMeta: ListMeta = ListMeta(),
    val searchTerms: List<String> = emptyList(),
    val summary: String? = null,
    val molecule: MoleculeInfo? = null,
)

@Serializable
data class ListMeta(
    val onset: String? = null,
    val duration: String? = null,
    val commonDose: String? = null,
) {
    val isEmpty get() = onset == null && duration == null && commonDose == null
}

@Serializable
data class MoleculeInfo(
    val smiles: String,
    val compound: String,
    val representative: Boolean,
    val assetName: String,
)

@Serializable
data class CombosPack(
    val locale: String,
    val columns: List<ComboColumn>,
    val matrix: Map<String, Map<String, ComboCell>>,
    val pairs: List<ComboPair>,
    val legend: List<StatusDefinition>,
)

@Serializable
data class ComboColumn(val key: String, val slug: String, val label: String, val group: String)

@Serializable
data class ComboCell(val statusKey: String, val label: String, val icon: String)

@Serializable
data class ComboPair(
    val id: String,
    val a: String,
    val b: String,
    val statusKey: String,
    val label: String,
    val icon: String,
    val definition: String,
    val note: String? = null,
    val sources: List<ComboSource> = emptyList(),
)

@Serializable
data class ComboSource(val author: String = "", val title: String = "", val url: String = "")

@Serializable
data class StatusDefinition(
    val statusKey: String,
    val icon: String,
    val label: String,
    val definition: String,
)

@Serializable
data class MetaPack(
    val locale: String,
    val siteTitle: String,
    val siteDescription: String,
    val disclaimer: String,
    val about: String,
)

// ---------------------------------------------------------------- Cards

@Serializable
data class CardsPack(
    val locale: String,
    val sources: Map<String, CardSource>,
    val gable: List<GableRow>,
    val cards: Map<String, SubstanceCard>,
)

@Serializable
data class CardSource(
    val id: String? = null,
    val author: String,
    val title: String,
    val publication: String? = null,
    val url: String? = null,
)

@Serializable
data class GableRow(
    val name: String,
    val key: String? = null,
    val label: String,
    val route: String,
    val ratio: Double,
    val extrapolated: Boolean = false,
    val atLeast: Boolean = false,
)

@Serializable
data class SubstanceCard(
    val key: String,
    val slug: String,
    val group: String,
    val displayName: String,
    val groupLabel: String,
    val aliases: List<String> = emptyList(),
    val content: CardContent,
    val primary: DoseChart? = null,
    val otherRoutes: List<DoseChart> = emptyList(),
    val referenceName: String? = null,
    val doseNote: String? = null,
    val timing: CardTiming,
    val margin: ToxicityMargin? = null,
    val marginDanger: Boolean = false,
    val dependence: DependenceRating,
    val spacing: SpacingPattern = SpacingPattern(),
    val personal: PersonalDose? = null,
    val avoid: List<AvoidCombo> = emptyList(),
    val sources: List<CardSource> = emptyList(),
    val details: CardDetails,
) {
    val hasTiming get() = timing.onset != null || timing.duration != null || timing.after != null
}

@Serializable
data class CardContent(
    val dose: String? = null,
    val prepare: String? = null,
    val marginNote: String? = null,
    val spacing: SpacingText? = null,
    val dependence: String? = null,
    val risks: List<RiskItem>? = null,
    val overdose: Overdose? = null,
)

@Serializable
data class SpacingText(val value: String, val label: String, val text: String)

@Serializable
data class RiskItem(val icon: String, val title: String, val text: String)

@Serializable
data class Overdose(val signs: List<String>, val actions: List<String>)

@Serializable
data class CardTiming(
    val onset: TimingValue? = null,
    val duration: TimingValue? = null,
    val after: TimingValue? = null,
)

@Serializable
data class TimingValue(val value: String, val unit: String) {
    /** Card shorthand for units (web CardFront `unitLabel`). */
    val shortUnit get() = when (unit) {
        "minutes" -> "min"
        "hours" -> "h"
        else -> unit
    }
}

@Serializable
data class ToxicityMargin(
    val ratio: Double,
    val source: String,
    val extrapolated: Boolean = false,
    val atLeast: Boolean = false,
    val compound: String? = null,
)

@Serializable
data class DependenceRating(
    val level: Int,
    val nutt: Double? = null,
    val nuttDrug: String? = null,
    val editorial: Boolean = false,
) {
    val clampedLevel get() = level.coerceIn(1, 5)
}

@Serializable
data class SpacingPattern(val pattern: String? = null, val unit: String? = null) {
    val cells get() = (pattern ?: "").map { it == 'x' }
}

@Serializable
data class AvoidCombo(
    val key: String,
    val label: String,
    val statusKey: String,
    val statusLabel: String,
    val icon: String,
)

@Serializable
data class CardDetails(
    val summary: String? = null,
    val isClassFallback: Boolean = false,
    val warning: String? = null,
    val avoidText: String? = null,
    val testKits: String? = null,
    val effects: List<EffectItem> = emptyList(),
    val pwEffects: List<PsychonautEffect> = emptyList(),
    val links: SubstanceLinks = SubstanceLinks(),
    val doseCharts: List<DoseChart> = emptyList(),
    val doseNote: String? = null,
    val hasStructure: Boolean = false,
)

@Serializable
data class EffectItem(val text: String, val icon: String)

@Serializable
data class PsychonautEffect(val label: String, val url: String)

@Serializable
data class SubstanceLinks(
    val experiences: String? = null,
    val pihkal: String? = null,
    val tihkal: String? = null,
) {
    val isEmpty get() = experiences == null && pihkal == null && tihkal == null
}

/** One route's dose scale, parsed by the web's `lib/dose-chart.ts`. */
@Serializable
data class DoseChart(
    val route: String,
    val routeLabel: String,
    val routeIcon: String,
    val chartable: Boolean,
    val unit: String? = null,
    val perKg: Boolean = false,
    val scaleMax: Double = 1.0,
    val segments: List<DoseSegment> = emptyList(),
    val labels: List<ScaleLabel> = emptyList(),
    val ticks: List<ScaleTick> = emptyList(),
    val rows: List<DoseRow> = emptyList(),
)

@Serializable
data class DoseSegment(
    val level: String,
    val amount: String,
    val color: String,
    val left: Double,
    val width: Double,
    val start: Double,
    val end: Double,
    val openEnd: Boolean,
    val isPoint: Boolean,
)

@Serializable
data class ScaleLabel(val text: String, val pos: Double, val color: String, val priority: Int)

@Serializable
data class ScaleTick(val value: Double, val text: String, val pos: Double, val priority: Int, val suffix: String)

@Serializable
data class DoseRow(val level: String, val amount: String)

/** Body-dependent guidance for the "For you" tile (web `Personal`). */
@OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface PersonalDose {
    /** Upper limit from a mg/kg guideline (MDMA, Saferparty). */
    @Serializable @SerialName("mgPerKg")
    data class MgPerKg(val male: Double, val female: Double) : PersonalDose

    /** The chart itself is in mg/kg (DXM); the common range converts to mg. */
    @Serializable @SerialName("perKgChart")
    data class PerKgChart(val minMgPerKg: Double? = null, val maxMgPerKg: Double? = null) : PersonalDose

    /** Figures assume a reference body weight (ketamine, MXE). */
    @Serializable @SerialName("referenceWeight")
    data class ReferenceWeight(val weightKg: Double) : PersonalDose

    /** EFSA single-dose and daily guidance. */
    @Serializable @SerialName("caffeine")
    data class Caffeine(val singleMgPerKg: Double, val singleMaxMg: Double, val dailyMg: Double) : PersonalDose

    /** Widmark blood alcohol estimate. */
    @Serializable @SerialName("bac")
    data class Bac(val gramsPerUnit: Double, val rMale: Double, val rFemale: Double, val limitPermille: Double) : PersonalDose
}
