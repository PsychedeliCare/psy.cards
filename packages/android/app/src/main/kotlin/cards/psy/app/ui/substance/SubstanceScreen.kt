package cards.psy.app.ui.substance

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.clickable
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.CardSource
import cards.psy.app.data.ComboPair
import cards.psy.app.data.ComboStatusGroup
import cards.psy.app.data.DoseRow
import cards.psy.app.data.Substance
import cards.psy.app.data.SubstanceCard
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.card.DoseList
import cards.psy.app.ui.card.DoseScale
import cards.psy.app.ui.card.RouteLabel
import cards.psy.app.ui.card.SubstanceCardDeck
import cards.psy.app.ui.combos.ComboPairSheet
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.components.StatusIcon
import cards.psy.app.ui.theme.PsyColors

/**
 * Card + details for one substance (web `SubstanceCard.astro`), without its
 * own scroll container so the substance page and the wheel can host it.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SubstanceCardContent(
    substance: Substance,
    onOpenSubstance: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val pack = LocalPack.current
    val card = pack.card(substance.key) ?: return
    var pair by remember { mutableStateOf<ComboPair?>(null) }
    val combos = remember { BringIntoViewRequester() }
    val scope = rememberCoroutineScope()

    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(28.dp)) {
        SubstanceCardDeck(
            card = card,
            moleculeAsset = if (card.details.hasStructure) substance.molecule?.assetName else null,
            onSelectCombo = { pair = pack.pair(substance.key, it) },
            onShowAllCombos = { scope.launch { combos.bringIntoView() } },
        )
        SubstanceDetails(card, onSelectPartner = { pair = pack.pair(substance.key, it) }, combos, Modifier.widthIn(max = 640.dp))
    }
    pair?.let { ComboPairSheet(it, onOpenSubstance = { key -> pair = null; onOpenSubstance(key) }) { pair = null } }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalFoundationApi::class)
@Composable
private fun SubstanceDetails(
    card: SubstanceCard,
    onSelectPartner: (String) -> Unit,
    combosRequester: BringIntoViewRequester,
    modifier: Modifier,
) {
    val pack = LocalPack.current
    val body = LocalBody.current
    val details = card.details
    var showTable by rememberSaveable { mutableStateOf(false) }
    var showPw by rememberSaveable { mutableStateOf(false) }

    Column(modifier.fillMaxWidth()) {
        Text(
            pack.t("card.details", "name" to card.displayName),
            fontSize = 22.sp,
            fontWeight = FontWeight.Black,
            color = PsyColors.fg,
            modifier = Modifier.padding(bottom = 12.dp).semantics { heading() },
        )
        details.summary?.let { Text(it, fontSize = 16.sp, lineHeight = 23.sp, color = PsyColors.inkSoft, modifier = Modifier.padding(bottom = 8.dp)) }
        if (details.isClassFallback) Text(pack.t("substanceCard.classFallback"), fontSize = 13.sp, color = PsyColors.fgMute)

        if (card.aliases.size > 4) {
            Section(pack.t("substanceCard.alsoKnownAs")) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    card.aliases.forEach { Pill(it) }
                }
            }
        }

        if (card.timing.onset != null || card.timing.duration != null) {
            Section(pack.t("substanceCard.timing")) {
                TimingChart(card.timing.onset, card.timing.duration, PsyColors.group(card.group), pack.t("substanceCard.effectTimeline", "name" to card.displayName))
            }
        }

        if (details.doseCharts.isNotEmpty()) {
            Section(pack.t("substanceCard.doses"), trailing = {
                SingleChoiceSegmentedButtonRow(Modifier.width(112.dp)) {
                    listOf(false to "chart-bar-horizontal-fill", true to "list-bullets-bold").forEachIndexed { index, (table, icon) ->
                        SegmentedButton(
                            selected = showTable == table,
                            onClick = { showTable = table },
                            shape = SegmentedButtonDefaults.itemShape(index, 2),
                            icon = {},
                            label = { PhIcon(if (table) "list-bullets-bold" else icon, size = 15.dp) },
                            modifier = Modifier.semantics { contentDescription = pack.t(if (table) "doseChart.table" else "doseChart.chart") },
                        )
                    }
                }
            }) {
                Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
                    details.doseCharts.forEach { chart ->
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            RouteLabel(chart, if (chart.perKg) body.weightKg?.let { "mg · ${pack.number(it)} kg" } else null)
                            if (chart.chartable && !showTable) {
                                DoseScale(chart, weightKg = if (chart.perKg) body.weightKg else null)
                            } else {
                                DoseList(chart.rows.ifEmpty { chart.segments.map { DoseRow(pack.t("doseChart.${it.level}"), it.amount) } })
                            }
                        }
                    }
                    details.doseNote?.let { Text(it, fontSize = 13.sp, color = PsyColors.fgMute) }
                }
            }
        }

        val groups = pack.comboGroups(card.key)
        if (groups.isNotEmpty()) {
            Box(Modifier.bringIntoViewRequester(combosRequester)) {
                Section(pack.t("substanceCard.combos")) {
                    Column {
                        groups.forEachIndexed { index, group ->
                            ComboStatusRow(group, onSelectPartner)
                            if (index < groups.size - 1) HorizontalDivider(color = PsyColors.fg.copy(alpha = 0.08f))
                        }
                    }
                }
            }
        }

        if (details.warning != null || details.avoidText != null || details.testKits != null) {
            Section(pack.t("substanceCard.safety")) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    details.warning?.let { Definition(pack.t("substanceCard.warning"), it) }
                    details.avoidText?.let { Definition(pack.t("substanceCard.avoidCombining"), it) }
                    details.testKits?.let { Definition(pack.t("substanceCard.testKits"), it) }
                }
            }
        }

        if (details.effects.isNotEmpty() || details.pwEffects.isNotEmpty()) {
            Section(pack.t("substanceCard.effects")) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        details.effects.forEach { Pill(it.text, it.icon) }
                    }
                    if (details.pwEffects.isNotEmpty()) {
                        val uri = LocalUriHandler.current
                        Surface(
                            onClick = { showPw = !showPw },
                            shape = RoundedCornerShape(14.dp),
                            color = PsyColors.tile,
                            contentColor = PsyColors.fg,
                        ) {
                            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("${pack.t("substanceCard.pwEffects")} (${details.pwEffects.size})", fontSize = 15.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                    PhIcon("caret-down-bold", size = 14.dp, tint = PsyColors.fgMute)
                                }
                                if (showPw) {
                                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                        details.pwEffects.forEach { effect ->
                                            Surface(onClick = { uri.openUri(effect.url) }, shape = CircleShape, color = PsyColors.fg.copy(alpha = 0.06f)) {
                                                Text(effect.label, fontSize = 13.sp, color = PsyColors.safe, modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp))
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (!details.links.isEmpty) {
            Section(pack.t("substanceCard.more")) {
                val uri = LocalUriHandler.current
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    details.links.experiences?.let { TextButton({ uri.openUri(it) }) { Text(pack.t("substanceCard.tripReports"), color = PsyColors.safe) } }
                    details.links.pihkal?.let { TextButton({ uri.openUri(it) }) { Text("PiHKAL", color = PsyColors.safe) } }
                    details.links.tihkal?.let { TextButton({ uri.openUri(it) }) { Text("TiHKAL", color = PsyColors.safe) } }
                }
            }
        }

        Section(pack.t("card.sources")) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) { card.sources.forEach { SourceRow(it) } }
        }

        if (details.hasStructure) {
            Text(
                linkLine("${pack.t("smilesCitation.prefix")} ", pack.t("smilesCitation.tool"), "https://github.com/reymond-group/smilesDrawer"),
                fontSize = 12.sp,
                color = PsyColors.fgMute,
                modifier = Modifier.padding(top = 18.dp),
            )
        }
        ContributeFooter(Modifier.padding(top = 22.dp))
    }
}

@Composable
private fun Section(title: String, trailing: (@Composable () -> Unit)? = null, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        HorizontalDivider(color = PsyColors.fg.copy(alpha = 0.1f))
        Column(Modifier.padding(vertical = 18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    title.uppercase(),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.2.sp,
                    color = PsyColors.fg,
                    modifier = Modifier.weight(1f).semantics { heading() },
                )
                trailing?.invoke()
            }
            content()
        }
    }
}

@Composable
private fun Definition(term: String, text: String) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(term, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = PsyColors.fgMute)
        Text(text, fontSize = 15.sp, color = PsyColors.fg)
    }
}

@Composable
private fun Pill(text: String, icon: String? = null) {
    Row(
        Modifier
            .background(PsyColors.fg.copy(alpha = 0.06f), CircleShape)
            .border(1.dp, PsyColors.tileEdge, CircleShape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        icon?.let { PhIcon(it, size = 13.dp, tint = PsyColors.fgMute) }
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = PsyColors.fg)
    }
}

@Composable
fun SourceRow(source: CardSource) {
    val uri = LocalUriHandler.current
    Column(Modifier.semantics(mergeDescendants = true) {}) {
        Text(
            source.title,
            fontSize = 15.sp,
            fontWeight = FontWeight.SemiBold,
            color = PsyColors.fg,
            textDecoration = if (source.url != null) TextDecoration.Underline else null,
            modifier = if (source.url != null) Modifier.clickable { uri.openUri(source.url) } else Modifier,
        )
        Text(listOfNotNull(source.author, source.publication).joinToString(", "), fontSize = 12.sp, color = PsyColors.fgMute)
    }
}

/** Plain text followed by an underlined link. */
fun linkLine(prefix: String, link: String, url: String) = buildAnnotatedString {
    append(prefix)
    withLink(LinkAnnotation.Url(url, TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline)))) { append(link) }
}

/** "Contribute on GitHub" (web `CardContribute.astro`). */
@Composable
fun ContributeFooter(modifier: Modifier = Modifier) {
    val pack = LocalPack.current
    val uri = LocalUriHandler.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Surface(
            onClick = { uri.openUri("https://github.com/TripSit/drugs") },
            shape = CircleShape,
            color = PsyColors.fg.copy(alpha = 0.06f),
            contentColor = PsyColors.fg,
            border = BorderStroke(1.dp, PsyColors.tileEdge),
        ) {
            Row(Modifier.height(46.dp).padding(horizontal = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(pack.t("footer.contributeOn"), fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
                PhIcon("github-logo-fill", size = 18.dp)
                Text("GitHub", fontSize = 15.sp, fontWeight = FontWeight.Bold)
            }
        }
        Text(pack.t("cardContribute.communityNote"), fontSize = 12.sp, color = PsyColors.fgMute)
        Text(
            linkLine(pack.t("cardContribute.chartIssuePrefix"), pack.t("cardContribute.chartIssueLink"), "https://github.com/raphaelsaunier/psy.cards"),
            fontSize = 12.sp,
            color = PsyColors.fgMute,
        )
    }
}

@Composable
fun ComboStatusRow(group: ComboStatusGroup, onSelect: (String) -> Unit) {
    Row(Modifier.padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.width(124.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(26.dp).background(PsyColors.status(group.statusKey), RoundedCornerShape(7.dp)), contentAlignment = Alignment.Center) {
                StatusIcon(group.icon, size = 15.dp, tint = PsyColors.inkOnStatus(group.statusKey))
            }
            Text(group.label, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fg)
        }
        Text(
            buildAnnotatedString {
                group.partners.forEachIndexed { index, partner ->
                    withLink(
                        LinkAnnotation.Clickable(partner.key, TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline, color = PsyColors.fg))) {
                            onSelect(partner.key)
                        },
                    ) { append(partner.name) }
                    if (index < group.partners.size - 1) withStyle(SpanStyle(color = PsyColors.fgMute)) { append(", ") }
                }
            },
            fontSize = 15.sp,
            lineHeight = 22.sp,
            color = PsyColors.fg,
            modifier = Modifier.weight(1f).padding(top = 2.dp),
        )
    }
}
