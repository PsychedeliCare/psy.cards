package cards.psy.app.data

import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class Sex { male, female }

enum class WeightUnit { kg, lb }

@Serializable
data class BodySnapshot(
    val sex: Sex? = null,
    val weightKg: Double? = null,
    val unit: WeightUnit = WeightUnit.kg,
    val remember: Boolean = true,
)

/**
 * The person's sex and weight, used to personalise doses (web
 * `scripts/body-profile.ts`). It never leaves the device: with "Save" on it
 * persists in app-private preferences, otherwise it only lives in memory.
 */
class BodyProfileStore(private val prefs: SharedPreferences?) {
    var snapshot by mutableStateOf(load())
        private set

    var dockCollapsed by mutableStateOf(prefs?.getBoolean(DOCK_KEY, false) ?: false)
        private set

    val sex get() = snapshot.sex
    val weightKg get() = snapshot.weightKg
    val unit get() = snapshot.unit
    val remember get() = snapshot.remember
    val isEmpty get() = snapshot.sex == null && snapshot.weightKg == null
    val displayWeight get() = snapshot.weightKg?.let { toDisplay(it, snapshot.unit) }

    fun collapseDock(collapsed: Boolean) {
        dockCollapsed = collapsed
        prefs?.edit()?.putBoolean(DOCK_KEY, collapsed)?.apply()
    }

    fun setSex(sex: Sex?) = update { it.copy(sex = sex) }

    /** Tapping the selected sex again clears it (web body dock). */
    fun toggleSex(sex: Sex) = setSex(if (snapshot.sex == sex) null else sex)

    fun setUnit(unit: WeightUnit) = update { it.copy(unit = unit) }
    fun setRemember(remember: Boolean) = update { it.copy(remember = remember) }
    fun clear() = update { it.copy(sex = null, weightKg = null) }

    /** Steps the weight by one display unit, starting from a typical adult. */
    fun stepWeight(steps: Int) {
        val unit = snapshot.unit
        val current = snapshot.weightKg?.let { toDisplay(it, unit) } ?: (toDisplay(DEFAULT_WEIGHT_KG, unit) - steps)
        val kg = (fromDisplay(current + steps, unit) * 10).roundToInt() / 10.0
        update { it.copy(weightKg = kg.coerceIn(MIN_WEIGHT_KG, MAX_WEIGHT_KG)) }
    }

    /** Typed weights outside 30–250 kg are rejected rather than clamped. */
    fun setDisplayWeight(value: Double?): Boolean {
        if (value == null) {
            update { it.copy(weightKg = null) }
            return true
        }
        val kg = fromDisplay(value, snapshot.unit)
        if (!kg.isFinite() || kg < MIN_WEIGHT_KG || kg > MAX_WEIGHT_KG) return false
        update { it.copy(weightKg = (kg * 10).roundToInt() / 10.0) }
        return true
    }

    private fun update(change: (BodySnapshot) -> BodySnapshot) {
        snapshot = sanitize(change(snapshot))
        val editor = prefs?.edit() ?: return
        if (snapshot.remember) editor.putString(STORAGE_KEY, json.encodeToString(BodySnapshot.serializer(), snapshot))
        else editor.remove(STORAGE_KEY)
        editor.apply()
    }

    private fun load(): BodySnapshot {
        val raw = prefs?.getString(STORAGE_KEY, null) ?: return BodySnapshot()
        return runCatching { sanitize(json.decodeFromString(BodySnapshot.serializer(), raw).copy(remember = true)) }
            .getOrDefault(BodySnapshot())
    }

    companion object {
        const val MIN_WEIGHT_KG = 30.0
        const val MAX_WEIGHT_KG = 250.0
        const val KG_PER_LB = 0.45359237
        const val DEFAULT_WEIGHT_KG = 70.0
        private const val STORAGE_KEY = "psy.cards:body"
        private const val DOCK_KEY = "psy.cards:body-dock-collapsed"
        private val json = Json { ignoreUnknownKeys = true }

        fun sanitize(input: BodySnapshot): BodySnapshot {
            val weight = input.weightKg
            return if (weight != null && !(weight.isFinite() && weight in MIN_WEIGHT_KG..MAX_WEIGHT_KG)) input.copy(weightKg = null) else input
        }

        fun toDisplay(weightKg: Double, unit: WeightUnit) =
            (if (unit == WeightUnit.lb) weightKg / KG_PER_LB else weightKg).roundToInt().toDouble()

        fun fromDisplay(value: Double, unit: WeightUnit) = if (unit == WeightUnit.lb) value * KG_PER_LB else value
    }
}

/** Pure dose maths behind the "For you" tile (web `lib/personal-dose.ts`). */
object PersonalDoseMath {
    /** Upper limit from a mg/kg guideline, e.g. MDMA 1.5 mg/kg (men) / 1.3 mg/kg (women). */
    fun upperLimitMg(weightKg: Double, mgPerKg: Double) = Math.round(weightKg * mgPerKg).toDouble()

    /** Converts a mg/kg amount to mg, rounded to a sensible precision. */
    fun perKgToMg(mgPerKg: Double, weightKg: Double): Double {
        val mg = mgPerKg * weightKg
        return if (mg >= 100) Math.round(mg / 5) * 5.0 else Math.round(mg).toDouble()
    }

    /** Widmark: peak blood alcohol (‰, g/kg) added by one unit of `grams` of ethanol. */
    fun bacPerUnit(gramsPerUnit: Double, weightKg: Double, r: Double) = gramsPerUnit / (weightKg * r)

    /** Units needed to reach a blood alcohol limit, rounded down to half units. */
    fun unitsToLimit(limitPermille: Double, perUnit: Double) = max(0.5, floor(limitPermille / perUnit * 2) / 2)

    /** EFSA: single caffeine doses up to ~3 mg/kg (200 mg for a 70 kg adult) raise no concerns. */
    fun caffeineSingleDoseMg(weightKg: Double, mgPerKg: Double, maxMg: Double) = min(maxMg, Math.round(weightKg * mgPerKg).toDouble())

    /** How much lighter than the reference body the person is, in % (0 when heavier). */
    fun lighterThanPct(referenceKg: Double, weightKg: Double) = max(0, Math.round((referenceKg - weightKg) / referenceKg * 100).toInt())
}

/** The "For you" tile's computed figure (web `personalResult`). */
data class PersonalResult(val value: String, val label: String, val formula: String) {
    companion object {
        fun make(personal: PersonalDose, profile: BodySnapshot, pack: DataPack): PersonalResult? {
            val weight = profile.weightKg ?: return null
            val kg = "${pack.number(weight)} kg"
            fun mg(value: Double) = pack.number(value)
            return when (personal) {
                is PersonalDose.MgPerKg -> {
                    val label = pack.t("card.yourMax")
                    val sex = profile.sex
                    if (sex != null) {
                        val factor = if (sex == Sex.male) personal.male else personal.female
                        PersonalResult("${mg(PersonalDoseMath.upperLimitMg(weight, factor))} mg", label, "${pack.number(factor, 1)} mg/kg × $kg")
                    } else {
                        val low = PersonalDoseMath.upperLimitMg(weight, personal.female)
                        val high = PersonalDoseMath.upperLimitMg(weight, personal.male)
                        PersonalResult(
                            "${mg(low)}–${mg(high)} mg",
                            label,
                            "${pack.number(personal.female, 1)}–${pack.number(personal.male, 1)} mg/kg × $kg",
                        )
                    }
                }
                is PersonalDose.PerKgChart -> {
                    val lo = personal.minMgPerKg ?: return null
                    val hi = personal.maxMgPerKg ?: return null
                    PersonalResult(
                        "${mg(PersonalDoseMath.perKgToMg(lo, weight))}–${mg(PersonalDoseMath.perKgToMg(hi, weight))} mg",
                        pack.t("card.yourRange"),
                        "${pack.number(lo, 1)}–${pack.number(hi, 1)} mg/kg × $kg",
                    )
                }
                is PersonalDose.Bac -> {
                    val sex = profile.sex ?: return null
                    val perUnit = PersonalDoseMath.bacPerUnit(personal.gramsPerUnit, weight, if (sex == Sex.male) personal.rMale else personal.rFemale)
                    val units = PersonalDoseMath.unitsToLimit(personal.limitPermille, perUnit)
                    PersonalResult(
                        "+${pack.number(perUnit, 2)} ‰",
                        pack.t("card.perUnit"),
                        pack.t(
                            "card.unitsToLimit",
                            "count" to if (units % 1.0 == 0.0) pack.number(units) else pack.number(units, 1),
                            "limit" to pack.number(personal.limitPermille, 1),
                        ),
                    )
                }
                is PersonalDose.Caffeine -> {
                    val single = PersonalDoseMath.caffeineSingleDoseMg(weight, personal.singleMgPerKg, personal.singleMaxMg)
                    PersonalResult("≤ ${mg(single)} mg", pack.t("card.singleDose"), pack.t("card.perDay", "amount" to "≤ ${mg(personal.dailyMg)} mg"))
                }
                is PersonalDose.ReferenceWeight -> null
            }
        }
    }
}
