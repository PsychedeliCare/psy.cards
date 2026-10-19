package cards.psy.app.ui.card

import android.content.Intent
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.net.toUri
import cards.psy.app.R
import cards.psy.app.data.CardContent
import cards.psy.app.data.Overdose
import cards.psy.app.data.PersonalDose
import cards.psy.app.data.PersonalDoseMath
import cards.psy.app.data.PersonalResult
import cards.psy.app.data.RiskItem
import cards.psy.app.data.Sex
import cards.psy.app.data.SpacingText
import cards.psy.app.data.SubstanceCard
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.CardTile
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.components.StatusIcon
import cards.psy.app.ui.components.TileChip
import cards.psy.app.ui.components.TileHeading
import cards.psy.app.ui.theme.PsyColors

// ------------------------------------------------------------- Front

/**
 * Card front (web `card/CardFront.astro`): dose scale, personal figure,
 * timing, toxicity margin and preparation advice.
 */
@Composable
fun CardFront(
    card: SubstanceCard,
    moleculeAsset: String?,
    swipe: Float,
    onFlip: () -> Unit,
    onShowRoutes: () -> Unit,
    onShowCompare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pack = LocalPack.current
    val body = LocalBody.current
    val content = card.content
    val face = PsyColors.face(card.group)
    val hue = PsyColors.group(card.group)
    val isPerKgChart = card.personal is PersonalDose.PerKgChart
    val showDoseTip = card.primary?.chartable == true && content.dose != null && !isPerKgChart
    val showSideTile = card.personal != null || showDoseTip
    val perKgWeight = if (card.primary?.perKg == true) body.weightKg else null
    val personal = card.personal
    val markerValue = if (personal is PersonalDose.MgPerKg && body.sex != null && body.weightKg != null) {
        PersonalDoseMath.upperLimitMg(body.weightKg!!, if (body.sex == Sex.male) personal.male else personal.female)
    } else null

    Box(modifier) {
        if (moleculeAsset != null) {
            MoleculeHologram(moleculeAsset, swipe, Modifier.align(Alignment.TopEnd).padding(top = 4.dp).size(210.dp))
        }
        Column(
            Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 20.dp, bottom = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            // Header
            Column(Modifier.padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    card.groupLabel.uppercase(),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.1.sp,
                    color = PsyColors.ink,
                    modifier = Modifier.background(hue, CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
                )
                val long = card.displayName.length > 11
                Text(
                    card.displayName,
                    fontSize = if (long) 30.sp else 38.sp,
                    lineHeight = if (long) 32.sp else 40.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = if (long) (-0.8).sp else (-1.4).sp,
                    color = PsyColors.fg,
                    modifier = Modifier.semantics { heading() },
                )
                if (card.aliases.isNotEmpty()) {
                    Text(
                        card.aliases.take(4).joinToString(" · "),
                        fontSize = 13.sp,
                        color = PsyColors.fgMute,
                        modifier = Modifier.padding(end = 90.dp),
                    )
                }
            }

            // Dose
            CardTile {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    TileHeading("scales-fill", pack.t("card.dose"), iconColor = hue)
                    val reference = card.referenceName
                    if (reference != null && card.primary?.chartable == true) {
                        Text(
                            reference,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = PsyColors.fg,
                            maxLines = 1,
                            modifier = Modifier
                                .background(hue.copy(alpha = 0.22f), CircleShape)
                                .padding(horizontal = 7.dp, vertical = 2.dp)
                                .semantics { contentDescription = pack.t("card.reference", "name" to reference) },
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    card.primary?.let { RouteLabel(it, perKgWeight?.let { w -> "mg · ${pack.number(w)} kg" }) }
                    if (card.otherRoutes.isNotEmpty()) {
                        TileChip(onClick = onShowRoutes, modifier = Modifier.semantics {
                            contentDescription = "${pack.t("card.otherRoutes")} (${card.otherRoutes.size})"
                        }) {
                            Text(pack.t("card.otherRoutesCount", "count" to "${card.otherRoutes.size}"))
                            PhIcon("caret-down-bold", size = 11.dp)
                        }
                    }
                }
                val primary = card.primary
                when {
                    primary != null && primary.chartable -> DoseScale(primary, Modifier.padding(horizontal = 2.dp), face, perKgWeight, markerValue)
                    primary != null -> DoseList(primary.rows)
                    content.dose != null -> Text(content.dose, fontSize = 15.sp, color = PsyColors.fg)
                }
            }

            if (showSideTile || card.hasTiming) {
                Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (showSideTile) {
                        CardTile(Modifier.weight(1f).fillMaxHeight()) { PersonalTileBody(card, hue) }
                    }
                    if (card.hasTiming) {
                        CardTile(Modifier.weight(1f).fillMaxHeight()) { TimingTileBody(card, hue) }
                    }
                }
            }

            // Toxicity margin
            CardTile {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TileHeading("skull-fill", pack.t("card.margin"), Modifier.weight(1f), iconColor = hue)
                    TileChip(onClick = onShowCompare) {
                        PhIcon("chart-bar-horizontal-fill", size = 13.dp)
                        Text(pack.t("card.marginCompare"))
                    }
                }
                MarginMeter(
                    margin = card.margin,
                    danger = card.marginDanger,
                    alcoholRatio = if (card.key == "alcohol") null else (pack.gable.firstOrNull { it.key == "alcohol" }?.ratio ?: 10.0),
                    face = face,
                    modifier = Modifier.padding(horizontal = 2.dp, vertical = if (card.margin == null) 2.dp else 4.dp),
                )
                val margin = card.margin
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PsyColors.fg)) {
                            append(
                                if (margin == null) pack.t("card.marginUnknown")
                                else pack.t(if (margin.atLeast) "card.marginAtLeast" else "card.marginLabel", "ratio" to pack.number(margin.ratio)),
                            )
                        }
                        margin?.compound?.let { append(" ($it)") }
                        if (margin?.extrapolated == true) withStyle(SpanStyle(color = PsyColors.fgMute)) { append(", ${pack.t("card.marginExtrapolated")}") }
                        if (margin == null) content.marginNote?.let { append(" $it") }
                    },
                    fontSize = 13.sp,
                    lineHeight = 17.sp,
                    color = PsyColors.inkSoft,
                )
            }

            // Test & prepare
            if (content.prepare != null) {
                CardTile {
                    TileHeading("test-tube-fill", pack.t("card.prepare"), iconColor = hue)
                    TileText(content.prepare)
                    if (content.dose != null && (personal is PersonalDose.Bac || personal is PersonalDose.Caffeine)) {
                        DashedDivider()
                        TileText(content.dose, color = PsyColors.fgMute)
                    }
                }
            }

            // Footer
            Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.logo), null, Modifier.size(18.dp).clip(RoundedCornerShape(4.dp)))
                Spacer(Modifier.width(6.dp))
                Text(pack.t("card.brand"), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = PsyColors.fgMute)
                Spacer(Modifier.weight(1f))
                FlipButton(pack.t("card.flipToSafety"), "arrows-clockwise-bold", prominent = true, onClick = onFlip)
            }
        }
    }
}

@Composable
private fun ColumnScope.PersonalTileBody(card: SubstanceCard, hue: Color) {
    val pack = LocalPack.current
    val body = LocalBody.current
    val personal = card.personal
    TileHeading(
        if (personal == null) "sparkle-fill" else "user-fill",
        pack.t(if (personal == null) "card.startLow" else "card.forYou"),
        iconColor = hue,
    )
    when {
        personal == null -> card.content.dose?.let { TileText(it) }
        personal is PersonalDose.ReferenceWeight -> {
            val weight = body.weightKg
            val lighter = weight?.let { PersonalDoseMath.lighterThanPct(personal.weightKg, it) }
            Text(
                buildAnnotatedString {
                    append(pack.t("card.refWeight", "weight" to pack.number(personal.weightKg)))
                    if (lighter != null) {
                        append(" ")
                        withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PsyColors.fg)) {
                            append(if (lighter >= 5) pack.t("card.lighter", "pct" to "$lighter") else pack.t("card.notLighter"))
                        }
                    }
                },
                fontSize = 13.sp,
                lineHeight = 17.sp,
                color = PsyColors.inkSoft,
            )
        }
        else -> {
            val result = PersonalResult.make(personal, body.snapshot, pack)
            AnimatedContent(result, label = "personal") { shown ->
                if (shown != null) {
                    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(
                            shown.value,
                            fontSize = if (shown.value.length > 9) 19.sp else 24.sp,
                            fontWeight = FontWeight.Black,
                            letterSpacing = (-0.6).sp,
                            color = PsyColors.fg,
                            maxLines = 1,
                        )
                        Text(shown.label, fontSize = 12.sp, fontWeight = FontWeight.Bold, color = PsyColors.fg)
                        Text(shown.formula, fontSize = 11.sp, color = PsyColors.fgMute, modifier = Modifier.padding(top = 2.dp))
                    }
                } else {
                    TileText(
                        when (personal) {
                            is PersonalDose.Bac -> pack.t("card.setBody")
                            is PersonalDose.Caffeine -> pack.t("card.setWeight")
                            else -> card.content.dose ?: ""
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun ColumnScope.TimingTileBody(card: SubstanceCard, hue: Color) {
    val pack = LocalPack.current
    TileHeading("clock-fill", pack.t("card.timing"), iconColor = hue)
    val rows = listOfNotNull(
        card.timing.onset?.let { "card.onset" to it },
        card.timing.duration?.let { "card.duration" to it },
        card.timing.after?.let { "card.afterEffects" to it },
    )
    Column {
        rows.forEachIndexed { index, (key, value) ->
            Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Bottom) {
                Text(pack.t(key), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fgMute)
                Spacer(Modifier.weight(1f))
                Text(
                    buildAnnotatedString {
                        withStyle(SpanStyle(fontSize = 15.sp, fontWeight = FontWeight.Black)) { append(value.value) }
                        withStyle(SpanStyle(fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fgMute)) { append(" ${value.shortUnit}") }
                    },
                    color = PsyColors.fg,
                    maxLines = 1,
                )
            }
            if (index < rows.size - 1) DashedDivider()
        }
    }
}

// -------------------------------------------------------------- Back

/**
 * Card back (web `card/CardBack.astro`): spacing, dependence, key risks,
 * combinations to avoid and what to do in an emergency.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun CardBack(
    card: SubstanceCard,
    onFlip: () -> Unit,
    onSelectCombo: (String) -> Unit,
    onShowAllCombos: () -> Unit,
    onShowDependence: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val pack = LocalPack.current
    val content: CardContent = card.content
    val hue = PsyColors.group(card.group)
    val maxAvoid = 7
    val shown = if (card.avoid.size > maxAvoid + 1) card.avoid.take(maxAvoid) else card.avoid
    val hidden = card.avoid.size - shown.size

    Column(
        modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, top = 20.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(Modifier.padding(bottom = 4.dp), verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(card.displayName.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.Black, letterSpacing = 1.2.sp, color = hue)
                Text(
                    pack.t("card.flipToSafety"),
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = (-0.8).sp,
                    color = PsyColors.fg,
                    modifier = Modifier.semantics { heading() },
                )
            }
            FlipButton(pack.t("card.faceDose"), "arrows-counter-clockwise-bold", prominent = false, onClick = onFlip)
        }

        Row(Modifier.height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            content.spacing?.let { spacing ->
                CardTile(Modifier.weight(1.5f).fillMaxHeight()) { SpacingTileBody(card, spacing, hue) }
            }
            CardTile(Modifier.weight(1f).fillMaxHeight()) {
                val level = card.dependence.clampedLevel
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TileHeading("link-break-fill", pack.t("card.dependence"), Modifier.weight(1f), iconColor = hue)
                    IconButton(onClick = onShowDependence, modifier = Modifier.size(28.dp)) {
                        PhIcon("info-bold", size = 13.dp, tint = PsyColors.fgMute)
                    }
                }
                DependenceMeter(level)
                Text(pack.t("card.dependenceLevels.$level"), fontSize = 17.sp, fontWeight = FontWeight.Black, color = PsyColors.fg)
                content.dependence?.let { Text(it, fontSize = 12.sp, lineHeight = 16.sp, color = PsyColors.fgMute) }
            }
        }

        content.risks?.takeIf { it.isNotEmpty() }?.let { risks ->
            CardTile {
                TileHeading("warning-fill", pack.t("card.risks"), iconColor = hue)
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) { risks.forEach { RiskRow(it) } }
            }
        }

        CardTile {
            TileHeading("prohibit-fill", pack.t("card.avoid"), iconColor = hue)
            if (card.avoid.isEmpty()) {
                TileText(pack.t("card.avoidNone"))
            } else {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(5.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    shown.forEach { combo ->
                        Surface(
                            onClick = { onSelectCombo(combo.key) },
                            shape = CircleShape,
                            color = PsyColors.status(combo.statusKey),
                            contentColor = PsyColors.inkOnStatus(combo.statusKey),
                            modifier = Modifier.semantics { contentDescription = "${combo.label}, ${combo.statusLabel}" },
                        ) {
                            Row(
                                Modifier.defaultMinSize(minHeight = 30.dp).padding(start = 7.dp, end = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp),
                            ) {
                                StatusIcon(combo.icon, size = 14.dp)
                                Text(combo.label, fontSize = 12.sp, fontWeight = FontWeight.Black)
                            }
                        }
                    }
                    if (hidden > 0) {
                        Surface(
                            onClick = onShowAllCombos,
                            shape = CircleShape,
                            color = PsyColors.fg.copy(alpha = 0.1f),
                            contentColor = PsyColors.fg,
                            border = androidx.compose.foundation.BorderStroke(1.dp, PsyColors.tileEdge),
                        ) {
                            Text(
                                pack.t("card.otherRoutesCount", "count" to "$hidden"),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Black,
                                modifier = Modifier.defaultMinSize(minHeight = 30.dp).padding(horizontal = 10.dp, vertical = 7.dp),
                            )
                        }
                    }
                }
            }
        }

        content.overdose?.let { EmergencyTile(it) }
    }
}

@Composable
private fun ColumnScope.SpacingTileBody(card: SubstanceCard, spacing: SpacingText, hue: Color) {
    val pack = LocalPack.current
    TileHeading("calendar-dots-fill", pack.t("card.spacing"), iconColor = hue)
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontSize = 22.sp, fontWeight = FontWeight.Black, color = PsyColors.fg, letterSpacing = (-0.6).sp)) { append(spacing.value) }
            append("  ")
            withStyle(SpanStyle(fontSize = 12.sp, fontWeight = FontWeight.Black, color = hue)) { append(spacing.label) }
        },
    )
    val cells = card.spacing.cells
    if (cells.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                cells.forEach { used ->
                    Box(
                        Modifier
                            .size(8.dp)
                            .then(if (used) Modifier.shadow(4.dp, CircleShape, ambientColor = hue, spotColor = hue) else Modifier)
                            .background(if (used) hue else PsyColors.fg.copy(alpha = 0.13f), CircleShape),
                    )
                }
            }
            Text(
                pack.t("card.spacingSpan", "count" to "${cells.size}", "unit" to pack.t("card.units.${card.spacing.unit ?: "week"}")),
                fontSize = 11.sp,
                color = PsyColors.fgMute,
            )
        }
    }
    TileText(spacing.text)
}

@Composable
private fun RiskRow(risk: RiskItem) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.semantics(mergeDescendants = true) {}) {
        Box(Modifier.size(30.dp).background(PsyColors.riskIconWell, RoundedCornerShape(9.dp)), contentAlignment = Alignment.Center) {
            PhIcon(risk.icon, size = 16.dp, tint = PsyColors.riskIcon)
        }
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PsyColors.fg)) { append("${risk.title}. ") }
                append(risk.text)
            },
            fontSize = 13.sp,
            lineHeight = 17.sp,
            color = PsyColors.inkSoft,
        )
    }
}

@Composable
private fun EmergencyTile(overdose: Overdose) {
    val pack = LocalPack.current
    val context = LocalContext.current
    val number = pack.t("card.emergencyNumber")
    CardTile(
        modifier = Modifier.drawBehind {
            drawRect(
                Brush.radialGradient(
                    listOf(PsyColors.emergency.copy(alpha = 0.26f), Color.Transparent),
                    center = Offset(size.width, 0f),
                    radius = size.width * 0.8f,
                ),
            )
        },
        tint = PsyColors.emergency.copy(alpha = 0.11f),
        edge = PsyColors.emergency.copy(alpha = 0.45f),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            TileHeading(
                "siren-fill",
                pack.t("card.emergency"),
                Modifier.weight(1f),
                iconColor = PsyColors.emergencyIcon,
                textColor = PsyColors.emergencyInk,
            )
            Surface(
                onClick = { context.startActivity(Intent(Intent.ACTION_DIAL, "tel:$number".toUri())) },
                shape = CircleShape,
                color = PsyColors.emergencyStrong,
                contentColor = Color.White,
                shadowElevation = 6.dp,
            ) {
                Row(
                    Modifier.defaultMinSize(minHeight = 36.dp).padding(horizontal = 12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    PhIcon("phone-call-fill", size = 15.dp)
                    Text(pack.t("card.call", "number" to number), fontSize = 13.sp, fontWeight = FontWeight.Black)
                }
            }
        }
        Text(
            buildAnnotatedString {
                withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = PsyColors.emergencyInk)) { append("${pack.t("card.signs")}: ") }
                append(overdose.signs.joinToString(" · "))
            },
            fontSize = 13.sp,
            lineHeight = 17.sp,
            color = PsyColors.inkSoft,
        )
        Column(
            verticalArrangement = Arrangement.spacedBy(4.dp),
            modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = pack.t("card.actions") },
        ) {
            overdose.actions.forEachIndexed { index, action ->
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("${index + 1}.", fontSize = 13.sp, fontWeight = FontWeight.Black, color = PsyColors.emergencyMarker)
                    Text(action, fontSize = 13.sp, lineHeight = 17.sp, color = PsyColors.fg)
                }
            }
        }
    }
}

// ------------------------------------------------------------ Shared

@Composable
fun TileText(text: String, color: Color = PsyColors.inkSoft) {
    Text(text, fontSize = 13.sp, lineHeight = 17.sp, color = color)
}

@Composable
private fun DashedDivider() {
    Box(
        Modifier.fillMaxWidth().height(1.dp).drawBehind {
            drawLine(
                PsyColors.tileEdge,
                Offset(0f, 0f),
                Offset(size.width, 0f),
                strokeWidth = 1.dp.toPx(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)),
            )
        },
    )
}

/** "Risks & safety ⟳" / "⟲ Dose" (web `.psy-flip`). */
@Composable
fun FlipButton(title: String, icon: String, prominent: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = if (prominent) PsyColors.fg else PsyColors.fg.copy(alpha = 0.1f),
        contentColor = if (prominent) PsyColors.ink else PsyColors.fg,
        shadowElevation = if (prominent) 6.dp else 0.dp,
    ) {
        Row(
            Modifier.defaultMinSize(minHeight = 40.dp).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            if (!prominent) PhIcon(icon, size = 14.dp)
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.Black)
            if (prominent) PhIcon(icon, size = 14.dp)
        }
    }
}

@Composable
fun DependenceMeter(level: Int, height: androidx.compose.ui.unit.Dp = 8.dp) {
    Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        (1..5).forEach { step ->
            Box(
                Modifier
                    .weight(1f)
                    .height(height)
                    .background(if (step <= level) PsyColors.dependence(level) else PsyColors.fg.copy(alpha = 0.12f), CircleShape),
            )
        }
    }
}
