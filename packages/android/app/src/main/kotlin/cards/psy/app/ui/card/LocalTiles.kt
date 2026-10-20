package cards.psy.app.ui.card

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import cards.psy.app.data.LegalStatus
import cards.psy.app.data.LocalInfoStore
import cards.psy.app.data.Organisation
import cards.psy.app.data.SubstanceCard
import cards.psy.app.ui.LocalCountry
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.CardTile
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.components.TileHeading
import cards.psy.app.ui.theme.PsyColors

private val TabularDigits = TextStyle(fontFeatureSettings = "tnum")

/** Opens the dialer on `number` (the person still presses call). */
@Composable
fun rememberDialer(): (String) -> Unit {
    val context = LocalContext.current
    return { number -> context.startActivity(Intent(Intent.ACTION_DIAL, LocalInfoStore.telUri(number).toUri())) }
}

// ------------------------------------------------------------- Help

/** Local harm reduction services (web `.psy-tile--help`). */
@Composable
fun HelpTile(organisations: List<Organisation>, hue: Color) {
    val pack = LocalPack.current
    CardTile {
        TileHeading("hand-heart-fill", pack.t("card.help"), iconColor = hue)
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            organisations.forEach { OrganisationRow(it, hue) }
        }
    }
}

/** One harm reduction service (web `.psy-help__item`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrganisationRow(organisation: Organisation, hue: Color) {
    val pack = LocalPack.current
    val uri = LocalUriHandler.current
    val dial = rememberDialer()
    Column(
        Modifier
            .fillMaxWidth()
            .drawBehind { drawRoundRect(hue.copy(alpha = 0.7f), size = Size(3.dp.toPx(), size.height), cornerRadius = CornerRadius(1.5.dp.toPx())) }
            .padding(start = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            val url = organisation.url
            Row(
                (if (url != null) Modifier.clickable(role = Role.Button) { uri.openUri(url) } else Modifier).weight(1f, fill = false),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                Text(organisation.name, fontSize = 13.sp, fontWeight = FontWeight.Black, color = PsyColors.fg)
                if (url != null) PhIcon("arrow-square-out-bold", Modifier.alpha(0.6f), size = 10.dp, tint = PsyColors.fg)
            }
            val city = organisation.city
            if (organisation.scope == "regional" && city != null) {
                Text(city, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fgMute)
            }
        }
        organisation.description(pack.locale)?.let {
            Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PsyColors.inkSoft)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            organisation.services.take(3).forEach { service ->
                Text(
                    pack.t("card.services.$service"),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold,
                    color = PsyColors.fg,
                    modifier = Modifier
                        .background(PsyColors.fg.copy(alpha = 0.08f), CircleShape)
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                )
            }
            organisation.phone?.let { phone ->
                Row(
                    Modifier
                        .border(1.dp, PsyColors.tileEdge, CircleShape)
                        .clip(CircleShape)
                        .clickable(role = Role.Button) { dial(phone) }
                        .padding(horizontal = 7.dp, vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    PhIcon("phone-fill", size = 10.dp, tint = PsyColors.fg)
                    Text(phone, fontSize = 11.sp, fontWeight = FontWeight.Black, color = PsyColors.fg, style = TabularDigits)
                }
            }
        }
    }
}

// ------------------------------------------------------------ Legal

/** Legal status in the person's country, with the country chip (web `.psy-tile--legal`). */
@Composable
fun LegalTile(card: SubstanceCard, hue: Color, onPickCountry: () -> Unit, onShowDetails: () -> Unit) {
    val pack = LocalPack.current
    val country = LocalCountry.current
    val info = country.current
    val entry = info?.substances?.get(card.key)
    CardTile {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            TileHeading("gavel-fill", pack.t("card.legal"), Modifier.weight(1f), iconColor = hue)
            CountryChip(onPickCountry)
        }
        if (info != null && entry != null) {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                LegalStatusPill(entry.status)
                entry.note?.let { Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PsyColors.inkSoft) }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(pack.t("card.legalAsOf", "date" to info.asOf), fontSize = 11.sp, color = PsyColors.fgMute, modifier = Modifier.weight(1f))
                Row(
                    Modifier
                        .clip(CircleShape)
                        .clickable(role = Role.Button, onClick = onShowDetails)
                        .defaultMinSize(minHeight = 28.dp)
                        .padding(horizontal = 6.dp)
                        .testTag("legal-details"),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(pack.t("card.legalDetails"), fontSize = 11.sp, fontWeight = FontWeight.Black, color = PsyColors.fg)
                    PhIcon("caret-right-bold", size = 9.dp, tint = PsyColors.fg)
                }
            }
        } else {
            TileText(pack.t(if (country.code == null) "country.prompt" else "country.noData"))
        }
    }
}

@Composable
fun LegalStatusPill(status: LegalStatus) {
    Text(
        LocalPack.current.t("card.legalStatus.${status.name}"),
        fontSize = 11.sp,
        fontWeight = FontWeight.Black,
        color = PsyColors.ink,
        maxLines = 1,
        modifier = Modifier.background(PsyColors.legal(status), CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

/** Country chip on the card: picks the country for every card. */
@Composable
fun CountryChip(onClick: () -> Unit) {
    val pack = LocalPack.current
    val country = LocalCountry.current
    val code = country.code
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = PsyColors.fg.copy(alpha = 0.07f),
        contentColor = PsyColors.fg,
        border = BorderStroke(1.dp, PsyColors.tileEdge),
        modifier = Modifier
            .widthIn(max = 170.dp)
            .testTag("card-country")
            .semantics { contentDescription = "${pack.t("country.title")}: ${code?.let { country.name(it, pack.javaLocale) } ?: pack.t("country.choose")}" },
    ) {
        Row(
            Modifier.defaultMinSize(minHeight = 28.dp).padding(horizontal = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(code?.let(LocalInfoStore::flag) ?: "🌍", fontSize = 12.sp)
            Text(
                code?.let { country.name(it, pack.javaLocale) } ?: pack.t("country.choose"),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false),
            )
            PhIcon("caret-down-bold", Modifier.alpha(0.6f), size = 9.dp)
        }
    }
}

/** Legal status details: the country's approach, sources and caveats. */
@Composable
fun LegalDetailsSheet(card: SubstanceCard, onDismiss: () -> Unit) {
    val pack = LocalPack.current
    val country = LocalCountry.current
    val uri = LocalUriHandler.current
    val info = country.current
    val entry = info?.substances?.get(card.key)
    PsySheet("${card.displayName} · ${country.code?.let { country.name(it, pack.javaLocale) } ?: ""}", onDismiss) {
        if (info == null || entry == null) return@PsySheet
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LegalStatusPill(entry.status)
            entry.note?.let { Text(it, fontSize = 15.sp, lineHeight = 20.sp) }
        }
        info.summary?.let { Text(it, fontSize = 13.sp, lineHeight = 18.sp, color = PsyColors.inkSoft) }
        info.drugChecking?.let { BoldLead("${pack.t("card.services.drug-checking")}: ", it) }
        info.callingForHelp?.let { BoldLead("${pack.t("card.emergency")} ", it) }
        if (entry.sources.isNotEmpty()) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    pack.t("card.legalSources").uppercase(),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp,
                    color = PsyColors.fgMute,
                    modifier = Modifier.semantics { heading() },
                )
                entry.sources.forEach { source ->
                    val url = source.url
                    Text(
                        source.title,
                        fontSize = 13.sp,
                        lineHeight = 18.sp,
                        fontWeight = if (url != null) FontWeight.SemiBold else FontWeight.Normal,
                        color = if (url != null) PsyColors.safe else PsyColors.fg,
                        modifier = if (url != null) Modifier.clickable(role = Role.Button) { uri.openUri(url) } else Modifier,
                    )
                }
            }
        }
        Text(pack.t("card.legalDisclaimer"), fontSize = 12.sp, lineHeight = 16.sp, color = PsyColors.fgMute)
    }
}

@Composable
private fun BoldLead(lead: String, text: String) {
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PsyColors.fg)) { append(lead) }
            append(text)
        },
        fontSize = 13.sp,
        lineHeight = 18.sp,
        color = PsyColors.inkSoft,
    )
}

// ---------------------------------------------------------- Picker

/**
 * One country picker for the whole app (web `#country-picker`), opened from
 * a card, the body dock or Settings. `allowNone` offers clearing the choice.
 */
@Composable
fun CountryPickerSheet(onDismiss: () -> Unit, allowNone: Boolean = false) {
    val pack = LocalPack.current
    val country = LocalCountry.current
    PsySheet(pack.t("country.title"), onDismiss) {
        Text(pack.t("country.hint"), fontSize = 13.sp, lineHeight = 18.sp, color = PsyColors.fgMute)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (allowNone) CountryOption("🌍", pack.t("country.choose"), country.code == null) { country.setCountry(null); onDismiss() }
            country.sortedCodes(pack.javaLocale).forEach { code ->
                CountryOption(LocalInfoStore.flag(code), country.name(code, pack.javaLocale), country.code == code, Modifier.testTag("country-$code")) {
                    country.setCountry(code)
                    onDismiss()
                }
            }
        }
        Text(pack.t("country.privacy"), fontSize = 12.sp, color = PsyColors.fgMute)
    }
}

@Composable
private fun CountryOption(flag: String, name: String, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(PsyColors.fg.copy(alpha = if (selected) 0.13f else 0.04f), shape)
            .border(1.dp, if (selected) PsyColors.fg.copy(alpha = 0.4f) else Color.Transparent, shape)
            .clickable(onClick = onClick)
            .defaultMinSize(minHeight = 44.dp)
            .padding(horizontal = 12.dp, vertical = 6.dp)
            .semantics {
                role = Role.RadioButton
                this.selected = selected
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(flag, fontSize = 18.sp)
        Text(name, fontSize = 14.sp, fontWeight = if (selected) FontWeight.Black else FontWeight.SemiBold, color = PsyColors.fg)
        Spacer(Modifier.weight(1f))
        RadioButton(selected = selected, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = PsyColors.fg))
    }
}
