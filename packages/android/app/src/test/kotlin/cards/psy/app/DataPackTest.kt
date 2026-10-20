package cards.psy.app

import cards.psy.app.data.BodyProfileStore
import cards.psy.app.data.ComboGrouping
import cards.psy.app.data.DataPack
import cards.psy.app.data.LegalStatus
import cards.psy.app.data.LocalInfoStore
import cards.psy.app.data.PersonalDose
import cards.psy.app.data.PersonalDoseMath
import cards.psy.app.data.Sex
import cards.psy.app.data.SupportedLocales
import cards.psy.app.data.WeightUnit
import cards.psy.app.ui.components.LabelLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.Locale

/** Reads the generated data pack straight from the app's assets. */
private fun pack(locale: String = "en"): DataPack {
    fun read(name: String) = File("src/main/assets/datapack/$locale/$name.json").readText()
    return DataPack.fromJson(locale, read("substances"), read("combos"), read("cards"), read("meta"), read("ui"))
}

class DataPackTest {
    @Test fun everyLocaleDecodesWithAllCards() {
        SupportedLocales.forEach { locale ->
            val pack = pack(locale)
            assertEquals(locale, 25, pack.cardsPack.cards.size)
            assertTrue(locale, pack.cardsPack.cards.values.all { it.content.overdose != null || it.content.risks != null })
        }
    }

    @Test fun mdmaCardMatchesTheWeb() {
        val card = pack().card("mdma")!!
        assertEquals("mg", card.primary?.unit)
        assertEquals(listOf("maois", "dxm", "tramadol"), card.avoid.map { it.key })
        assertEquals(PersonalDose.MgPerKg(male = 1.5, female = 1.3), card.personal)
    }

    /** Effects are translated by the overlays but keep the authored icons. */
    @Test fun cardEffectsKeepTheirIconsInEveryLocale() {
        val icons = pack().card("mdma")!!.content.effects!!.map { it.icon }
        assertEquals(4, icons.size)
        SupportedLocales.forEach { locale ->
            assertEquals(locale, icons, pack(locale).card("mdma")!!.content.effects!!.map { it.icon })
        }
        assertTrue(pack("fr").card("mdma")!!.content.effects!!.none { it.label == "Love of music" })
    }

    /** Column keys that differ from the dataset's (dxm → dextromethorphan) still resolve. */
    @Test fun comboMatrixResolvesAliasedKeys() {
        val pack = pack()
        assertEquals("dangerous", pack.interaction("mdma", "dxm")?.statusKey)
        assertTrue(pack.combosPack.matrix.values.flatMap { it.values }.none { it.statusKey == "unknown" })
    }

    @Test fun comboGroupsFollowRiskOrder() {
        val pack = pack()
        val groups = pack.comboGroups("lsd")
        val ranks = groups.map { ComboGrouping.riskOrder.indexOf(it.statusKey) }
        assertEquals(ranks.sorted(), ranks)
        assertEquals(pack.substances.size - 1, groups.sumOf { it.partners.size })
    }

    @Test fun namedPlaceholdersSurviveReordering() {
        assertEquals("112 anrufen", pack("de").t("card.call", "number" to "112"))
        assertEquals("Call 112", pack().t("card.call", "number" to "112"))
    }

    @Test fun localeAwareNumbers() {
        assertEquals("1,5", pack("fr").number(1.5, 1))
        assertEquals("1.5", pack().number(1.5, 1))
    }
}

class LocalInfoTest {
    private val countries = LocalInfoStore.decode(File("src/main/assets/datapack/local.json").readText()).countries

    @Test fun decodesEveryCountry() {
        assertTrue(countries.size >= 40)
        val ch = countries.getValue("CH")
        assertEquals("144", ch.emergency.number)
        assertEquals("145", ch.emergency.poison?.phone)
        assertEquals(LegalStatus.illegal, ch.substances.getValue("mdma").status)
        assertTrue(countries.values.all { it.emergency.number.isNotBlank() })
    }

    @Test fun unknownStatusesFallBack() {
        val pack = LocalInfoStore.decode(
            """{"countries":{"ZZ":{"country":"ZZ","name":"Nowhere","asOf":"2026","emergency":{"number":"112"},"substances":{"lsd":{"status":"sideways"}}}}}""",
        )
        assertEquals(LegalStatus.unknown, pack.countries.getValue("ZZ").substances.getValue("lsd").status)
    }

    @Test fun savedChoiceElseDeviceRegion() {
        val store = LocalInfoStore(countries, prefs = null, regions = listOf("US", "ch"))
        assertEquals("CH", store.code)
        assertFalse(store.isChosen)
        assertEquals("144", store.emergencyNumber)
        store.setCountry("DE")
        assertTrue(store.isChosen)
        store.setCountry("??")
        assertNull(store.code)
        assertEquals("112", store.emergencyNumber)
    }

    @Test fun organisationsSkipPoisonCentresAndPreferSubstanceServices() {
        val store = LocalInfoStore(countries, prefs = null, regions = listOf("CH"))
        val picked = store.organisations("mdma")
        assertTrue(picked.size in 1..3)
        assertTrue(picked.none { "poison-centre" in it.services })
        val specific = countries.getValue("CH").organisations.filter { "mdma" in it.substances && "poison-centre" !in it.services }
        if (specific.isNotEmpty()) assertEquals(specific.first(), picked.first())
    }

    @Test fun localNumbersAndNames() {
        assertEquals("🇨🇭", LocalInfoStore.flag("ch"))
        assertEquals("tel:+41445551234", LocalInfoStore.telUri("+41 44 555 12 34"))
        assertEquals("Call 144 now, not 1120", LocalInfoStore.localiseEmergency("Call 112 now, not 1120", "144"))
        val store = LocalInfoStore(countries, prefs = null)
        assertEquals("Suisse", store.name("CH", Locale.FRENCH))
        val codes = store.sortedCodes(Locale.GERMAN)
        assertEquals(codes.map { store.name(it, Locale.GERMAN) }.sortedWith(java.text.Collator.getInstance(Locale.GERMAN)), codes.map { store.name(it, Locale.GERMAN) })
    }
}

class PersonalDoseTest {
    @Test fun mdmaUpperLimit() {
        assertEquals(105.0, PersonalDoseMath.upperLimitMg(70.0, 1.5), 0.0)
        assertEquals(78.0, PersonalDoseMath.upperLimitMg(60.0, 1.3), 0.0)
    }

    @Test fun perKgConversionRounds() {
        assertEquals(175.0, PersonalDoseMath.perKgToMg(2.5, 70.0), 0.0)
        assertEquals(75.0, PersonalDoseMath.perKgToMg(1.5, 50.0), 0.0)
    }

    @Test fun widmarkUnits() {
        val perUnit = PersonalDoseMath.bacPerUnit(8.0, 70.0, 0.68)
        assertEquals(0.168, perUnit, 0.001)
        assertEquals(2.5, PersonalDoseMath.unitsToLimit(0.5, perUnit), 0.0)
    }

    @Test fun caffeineCap() {
        assertEquals(200.0, PersonalDoseMath.caffeineSingleDoseMg(70.0, 3.0, 200.0), 0.0)
        assertEquals(150.0, PersonalDoseMath.caffeineSingleDoseMg(50.0, 3.0, 200.0), 0.0)
    }

    @Test fun lighterPercentage() {
        assertEquals(19, PersonalDoseMath.lighterThanPct(68.0, 55.0))
        assertEquals(0, PersonalDoseMath.lighterThanPct(68.0, 90.0))
    }
}

class LabelLayoutTest {
    @Test fun labelsNeverOverlap() {
        val placed = LabelLayout.spread(
            listOf(LabelLayout.Box(20.0, 18.0, 1), LabelLayout.Box(25.0, 18.0, 3), LabelLayout.Box(30.0, 18.0, 1)),
            gap = 2.0,
        ).sortedBy { it.x }
        placed.zipWithNext().forEach { (a, b) -> assertTrue(b.x - a.x >= 18 + 2 - 0.05) }
        assertTrue(placed.all { it.x in 9.0..91.0 })
    }

    @Test fun lowestPriorityDroppedWhenCrowded() {
        val placed = LabelLayout.spread(
            listOf(LabelLayout.Box(20.0, 45.0, 0), LabelLayout.Box(50.0, 45.0, 3), LabelLayout.Box(80.0, 45.0, 1)),
            gap = 2.0,
        )
        assertEquals(2, placed.size)
        assertFalse(placed.any { it.index == 0 })
    }
}

class BodyProfileTest {
    @Test fun steppingStartsFromTypicalAdult() {
        val body = BodyProfileStore(null)
        body.stepWeight(1)
        assertEquals(70.0, body.weightKg)
        body.stepWeight(1)
        assertEquals(71.0, body.weightKg)
    }

    @Test fun rejectsOutOfRangeAndConvertsPounds() {
        val body = BodyProfileStore(null)
        assertFalse(body.setDisplayWeight(12.0))
        assertNull(body.weightKg)
        body.setUnit(WeightUnit.lb)
        body.setDisplayWeight(154.0)
        assertEquals(69.9, body.weightKg!!, 0.05)
        assertEquals(154.0, body.displayWeight)
    }

    @Test fun tappingSelectedSexClearsIt() {
        val body = BodyProfileStore(null)
        body.toggleSex(Sex.male)
        assertEquals(Sex.male, body.sex)
        body.toggleSex(Sex.male)
        assertNull(body.sex)
    }
}
