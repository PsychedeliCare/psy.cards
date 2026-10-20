package cards.psy.app.ui.settings

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.clickable
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.os.LocaleListCompat
import cards.psy.app.R
import cards.psy.app.data.LocalInfoStore
import cards.psy.app.data.Sex
import cards.psy.app.data.SupportedLocales
import cards.psy.app.data.WeightUnit
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalCountry
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.card.CountryPickerSheet
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.components.StatusIcon
import cards.psy.app.ui.substance.SourceRow
import cards.psy.app.ui.theme.PsyColors

private val localeNames = mapOf("en" to "English", "fr" to "Français", "de" to "Deutsch", "it" to "Italiano")

@Composable
fun SettingsScreen(contentPadding: PaddingValues) {
    val pack = LocalPack.current
    val body = LocalBody.current
    val country = LocalCountry.current
    val uri = LocalUriHandler.current
    var pickCountry by remember { mutableStateOf(false) }

    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = contentPadding,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        item {
            Column(Modifier.widthIn(max = 640.dp).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Image(painterResource(R.drawable.logo), null, Modifier.size(34.dp).clip(RoundedCornerShape(8.dp)))
                    Text("psy.cards", fontSize = 22.sp, fontWeight = FontWeight.Black)
                }
                Text(pack.t("meta.landingDescription"), fontSize = 15.sp, color = PsyColors.fgMute)
            }
        }

        item {
            Group(pack.t("layout.language")) {
                SupportedLocales.forEach { locale ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .selectable(pack.locale == locale, role = Role.RadioButton) {
                                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(locale))
                            }
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(localeNames[locale] ?: locale, fontSize = 16.sp, modifier = Modifier.weight(1f))
                        RadioButton(selected = pack.locale == locale, onClick = null)
                    }
                }
            }
        }

        if (country.countries.isNotEmpty()) {
            item {
                Group(pack.t("country.title"), footer = "${pack.t("country.hint")} ${pack.t("country.privacy")}") {
                    val code = country.code
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clickable(role = Role.Button) { pickCountry = true }
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .testTag("country-picker"),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        PhIcon("globe-fill", size = 18.dp, tint = PsyColors.fgMute)
                        Text(pack.t("country.choose"), fontSize = 16.sp, modifier = Modifier.weight(1f))
                        Text(
                            code?.let { "${LocalInfoStore.flag(it)}  ${country.name(it, pack.javaLocale)}" } ?: "—",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = if (code == null) PsyColors.fgMute else PsyColors.fg,
                        )
                        PhIcon("caret-right-bold", size = 12.dp, tint = PsyColors.fgMute)
                    }
                }
            }
        }

        item {
            Group(pack.t("body.title"), footer = pack.t("body.privacyDevice")) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        listOf(null to "—", Sex.male to pack.t("body.male"), Sex.female to pack.t("body.female")).forEachIndexed { index, (sex, label) ->
                            SegmentedButton(body.sex == sex, { body.setSex(sex) }, SegmentedButtonDefaults.itemShape(index, 3)) { Text(label) }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(pack.t("body.weight"), fontSize = 16.sp, modifier = Modifier.weight(1f))
                        FilledTonalIconButton({ body.stepWeight(-1) }, Modifier.semantics { contentDescription = pack.t("body.decrease") }) {
                            Icon(painterResource(R.drawable.ph_minus_bold), null, Modifier.size(16.dp))
                        }
                        Text(
                            body.displayWeight?.let { "${pack.number(it)} ${body.unit.name}" } ?: "—",
                            fontSize = 17.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 12.dp),
                        )
                        FilledTonalIconButton({ body.stepWeight(1) }, Modifier.semantics { contentDescription = pack.t("body.increase") }) {
                            Icon(painterResource(R.drawable.ph_plus_bold), null, Modifier.size(16.dp))
                        }
                    }
                    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                        WeightUnit.entries.forEachIndexed { index, unit ->
                            SegmentedButton(body.unit == unit, { body.setUnit(unit) }, SegmentedButtonDefaults.itemShape(index, 2)) { Text(unit.name) }
                        }
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(pack.t("body.saveHint"), fontSize = 16.sp, modifier = Modifier.weight(1f))
                        Switch(body.remember, { body.setRemember(it) }, colors = SwitchDefaults.colors(checkedTrackColor = PsyColors.saveOn))
                    }
                    if (!body.isEmpty) {
                        TextButton(onClick = { body.clear() }) { Text(pack.t("body.clear"), color = PsyColors.emergency) }
                    }
                }
            }
        }

        item {
            Group(pack.t("legend.ariaLabel")) {
                pack.combosPack.legend.forEach { item ->
                    Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Box(Modifier.size(28.dp).background(PsyColors.status(item.statusKey), RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
                            StatusIcon(item.icon, size = 16.dp, tint = PsyColors.inkOnStatus(item.statusKey))
                        }
                        Column {
                            Text(item.label, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                            Text(item.definition, fontSize = 13.sp, color = PsyColors.fgMute)
                        }
                    }
                }
            }
        }

        item {
            Group(pack.t("card.sources")) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    pack.cardsPack.sources.toSortedMap().values.forEach { SourceRow(it) }
                }
            }
        }

        item {
            Group(pack.t("acknowledgements.title")) {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                    Text(pack.meta.about, fontSize = 13.sp, color = PsyColors.fgMute)
                    TextButton({ uri.openUri("https://tripsit.me") }) { Text("TripSit", color = PsyColors.safe) }
                    TextButton({ uri.openUri("https://psychonautwiki.org") }) { Text("PsychonautWiki", color = PsyColors.safe) }
                    TextButton({ uri.openUri("https://github.com/TripSit/drugs") }) { Text("${pack.t("footer.contributeOn")} GitHub", color = PsyColors.safe) }
                }
            }
        }

        item {
            Text(
                pack.meta.disclaimer.ifBlank { pack.t("landing.disclaimer") },
                fontSize = 12.sp,
                color = PsyColors.fgMute,
                modifier = Modifier.widthIn(max = 640.dp).padding(horizontal = 32.dp, vertical = 16.dp),
            )
        }
    }
    if (pickCountry) CountryPickerSheet(onDismiss = { pickCountry = false }, allowNone = true)
}

@Composable
private fun Group(title: String, footer: String? = null, content: @Composable () -> Unit) {
    Column(Modifier.widthIn(max = 640.dp).fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(
            title.uppercase(),
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            letterSpacing = 1.1.sp,
            color = PsyColors.fgMute,
            modifier = Modifier.padding(start = 16.dp, bottom = 6.dp).semantics { heading() },
        )
        Surface(shape = RoundedCornerShape(22.dp), color = PsyColors.ink2, contentColor = PsyColors.fg) {
            Column(Modifier.padding(vertical = 6.dp)) { content() }
        }
        footer?.let { Text(it, fontSize = 12.sp, color = PsyColors.fgMute, modifier = Modifier.padding(start = 16.dp, top = 6.dp, end = 16.dp)) }
    }
}
