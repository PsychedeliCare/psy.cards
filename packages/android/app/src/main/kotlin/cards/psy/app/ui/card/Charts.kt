package cards.psy.app.ui.card

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.DoseChart
import cards.psy.app.data.DoseRow
import cards.psy.app.data.GableRow
import cards.psy.app.data.PersonalDoseMath
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.LabelLayout
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.theme.PsyColors
import cards.psy.app.ui.theme.hexColor
import cards.psy.app.ui.theme.hsl
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min

private val ScaleLabelStyle = TextStyle(fontSize = 11.5.sp, fontWeight = FontWeight.ExtraBold)
private val ScaleTickStyle = TextStyle(fontSize = 11.5.sp, fontWeight = FontWeight.SemiBold, fontFeatureSettings = "tnum")

/**
 * Linear dose chart (web `card/DoseScale.astro`): coloured ranges sitting on
 * a continuous line with a dotted bracket under each range, level names
 * above and boundary amounts below, placed without collisions against the
 * real text widths.
 */
@Composable
fun DoseScale(
    chart: DoseChart,
    modifier: Modifier = Modifier,
    face: Color = PsyColors.ink2,
    weightKg: Double? = null,
    markerValue: Double? = null,
) {
    val pack = LocalPack.current
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val description = chart.labels.zip(chart.segments).joinToString(", ") { (label, segment) -> "${label.text}: ${segment.amount}" }
    val tickTexts = chart.ticks.map { tick ->
        if (chart.perKg && weightKg != null) "${pack.number(PersonalDoseMath.perKgToMg(tick.value, weightKg))}${tick.suffix}" else tick.text
    }
    val markerFraction by animateFloatAsState(
        targetValue = markerValue?.let { min(1.0, it / chart.scaleMax).toFloat() } ?: -1f,
        label = "marker",
    )

    BoxWithConstraints(modifier.fillMaxWidth().semantics { contentDescription = description }) {
        val widthPx = constraints.maxWidth.toFloat().coerceAtLeast(1f)
        fun pct(px: Float) = (px / widthPx * 100).toDouble()
        val labelPlacement = LabelLayout.spread(
            chart.labels.map { label ->
                LabelLayout.Box(label.pos, pct(measurer.measure(label.text.lowercase(), ScaleLabelStyle).size.width + with(density) { 3.dp.toPx() }), label.priority)
            },
            gap = pct(with(density) { 6.dp.toPx() }),
        )
        val tickPlacement = LabelLayout.spread(
            chart.ticks.mapIndexed { index, tick ->
                LabelLayout.Box(tick.pos, pct(measurer.measure(tickTexts[index], ScaleTickStyle).size.width + with(density) { 2.dp.toPx() }), tick.priority)
            },
            gap = pct(with(density) { 7.dp.toPx() }),
        )

        Column {
            PlacedRow(labelPlacement.map { it.x }) {
                labelPlacement.forEach { placed ->
                    val label = chart.labels[placed.index]
                    Text(label.text.lowercase(), style = ScaleLabelStyle, color = hexColor(label.color), maxLines = 1)
                }
            }
            Box(Modifier.padding(top = 5.dp, bottom = 3.dp).fillMaxWidth().height(TrackHeight + BracketGap + BracketHeight)) {
                DoseTrack(chart, face, Modifier.fillMaxWidth().height(TrackHeight + BracketGap + BracketHeight))
                if (markerFraction >= 0f) {
                    val trackHeight = TrackHeight
                    Box(
                        Modifier
                            .offset(x = with(density) { (widthPx * markerFraction).toDp() } - trackHeight * 0.85f, y = -trackHeight * 0.35f)
                            .requiredSize(trackHeight * 1.7f)
                            .shadow(4.dp, CircleShape)
                            .background(face, CircleShape)
                            .border(3.dp, PsyColors.fg, CircleShape),
                    )
                }
            }
            PlacedRow(tickPlacement.map { it.x }) {
                tickPlacement.forEach { placed ->
                    Text(tickTexts[placed.index], style = ScaleTickStyle, color = PsyColors.inkSoft, maxLines = 1)
                }
            }
        }
    }
}

private val TrackHeight = 9.dp

/** Dotted bracket under each range (start → end amount). */
private val BracketHeight = 5.dp
private val BracketGap = 2.dp

/** Positions each child centred at x% of the row (web `left: var(--x)` + translateX(-50%)). */
@Composable
private fun PlacedRow(xs: List<Double>, content: @Composable () -> Unit) {
    Layout(content, Modifier.fillMaxWidth()) { measurables, constraints ->
        val placeables = measurables.map { it.measure(constraints.copy(minWidth = 0)) }
        val height = placeables.maxOfOrNull { it.height } ?: 0
        layout(constraints.maxWidth, height) {
            placeables.forEachIndexed { index, placeable ->
                val center = (xs.getOrElse(index) { 0.0 } / 100 * constraints.maxWidth).toInt()
                placeable.placeRelative(center - placeable.width / 2, 0)
            }
        }
    }
}

@Composable
private fun DoseTrack(chart: DoseChart, face: Color, modifier: Modifier) {
    Canvas(modifier) {
        val h = TrackHeight.toPx()
        // The continuous line the ranges sit on.
        val lineH = h * 0.45f
        drawRoundRect(
            PsyColors.fg.copy(alpha = 0.11f),
            topLeft = Offset(-3.dp.toPx(), (h - lineH) / 2),
            size = Size(size.width + 6.dp.toPx(), lineH),
            cornerRadius = CornerRadius(lineH / 2),
        )
        // Dotted brackets spanning each range.
        val half = 0.5.dp.toPx()
        val dots = PathEffect.dashPathEffect(floatArrayOf(1.5.dp.toPx(), 1.8.dp.toPx()))
        for (segment in chart.segments) {
            if (segment.isPoint) continue
            val x0 = size.width * (segment.left / 100).toFloat()
            val x1 = x0 + max(size.width * (segment.width / 100).toFloat(), h)
            val top = h + BracketGap.toPx()
            val bottom = top + BracketHeight.toPx()
            val bracket = Path().apply {
                moveTo(x0 + half, top)
                lineTo(x0 + half, bottom)
                lineTo(if (segment.openEnd) x1 - h else x1 - half, bottom)
                if (!segment.openEnd) lineTo(x1 - half, top)
            }
            drawPath(bracket, hexColor(segment.color).copy(alpha = 0.6f), style = Stroke(1.dp.toPx(), pathEffect = dots))
        }
        val ring = max(1.5.dp.toPx(), h * 0.2f)
        for (segment in chart.segments) {
            val color = hexColor(segment.color)
            val x = size.width * (segment.left / 100).toFloat()
            if (segment.isPoint) {
                val r = h * 0.62f
                drawCircle(face, r + ring, Offset(x, h / 2))
                drawCircle(color, r, Offset(x, h / 2))
                continue
            }
            val w = max(size.width * (segment.width / 100).toFloat(), h)
            if (segment.openEnd) {
                // Dashes fading out: the range has no upper bound.
                val shape = Path().apply {
                    addRoundRect(
                        androidx.compose.ui.geometry.RoundRect(
                            left = x, top = 0f, right = x + w, bottom = h,
                            topLeftCornerRadius = CornerRadius(h / 2), bottomLeftCornerRadius = CornerRadius(h / 2),
                        ),
                    )
                }
                clipPath(shape) {
                    var dash = x
                    val period = h * 0.95f
                    while (dash < x + w) {
                        drawRect(color, Offset(dash, 0f), Size(period * 0.55f, h))
                        dash += period
                    }
                    drawRect(
                        Brush.horizontalGradient(0f to color, 0.45f to color, 1f to color.copy(alpha = 0f), startX = x, endX = x + w),
                        Offset(x, 0f),
                        Size(w, h),
                    )
                }
            } else {
                drawRoundRect(face, Offset(x - ring, -ring), Size(w + ring * 2, h + ring * 2), CornerRadius(h / 2 + ring))
                drawRoundRect(color, Offset(x, 0f), Size(w, h), CornerRadius(h / 2))
            }
        }
    }
}

/** Unchartable doses as a compact two-column list (web `.psy-dose-list`). */
@Composable
fun DoseList(rows: List<DoseRow>, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        rows.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                pair.forEach { row ->
                    Row(Modifier.weight(1f)) {
                        Text(row.level.lowercase(), color = PsyColors.fgMute, fontSize = 12.sp)
                        Spacer(Modifier.weight(1f))
                        Text(row.amount, color = PsyColors.fg, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

/** Route name with its icon and the unit chip (web `.psy-route`). */
@Composable
fun RouteLabel(chart: DoseChart, unitOverride: String? = null) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        PhIcon(chart.routeIcon, size = 14.dp, tint = PsyColors.fgMute)
        Text(
            chart.routeLabel.replaceFirstChar { it.uppercase() },
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = PsyColors.fg,
            maxLines = 1,
        )
        val unit = unitOverride ?: chart.unit
        if (chart.chartable && unit != null) {
            Text(
                unit,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                color = PsyColors.fgMute,
                modifier = Modifier
                    .background(PsyColors.fg.copy(alpha = 0.08f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp),
            )
        }
    }
}

/**
 * Gable (2004) safety ratios — lethal dose ÷ usual dose — on a log scale
 * (web `card/MarginChart.astro`). Extrapolated values are dashed.
 */
@Composable
fun GableChart(rows: List<GableRow>, current: String) {
    val pack = LocalPack.current
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        rows.sortedBy { it.ratio }.forEach { row ->
            val isCurrent = row.key == current
            Row(
                Modifier
                    .fillMaxWidth()
                    .background(if (isCurrent) PsyColors.fg.copy(alpha = 0.1f) else Color.Transparent, RoundedCornerShape(8.dp))
                    .padding(horizontal = 6.dp, vertical = 3.dp)
                    .semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    row.label,
                    fontSize = 13.sp,
                    fontWeight = if (isCurrent) FontWeight.Black else FontWeight.Medium,
                    color = if (isCurrent) PsyColors.fg else PsyColors.inkSoft,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(118.dp),
                )
                BoxWithConstraints(Modifier.weight(1f).height(22.dp)) {
                    val fraction = max(0.06f, (log10(row.ratio) / 3).toFloat())
                    val hue = PsyColors.marginHue(row.ratio)
                    val shape = RoundedCornerShape(5.dp)
                    val barModifier = Modifier.width(max(maxWidth.value * fraction, 46f).dp).height(22.dp)
                    val text = "${if (row.atLeast) ">" else ""}${pack.number(row.ratio)}×"
                    Box(
                        if (row.extrapolated) {
                            barModifier
                                .background(hsl(hue, 0.72f, 0.5f, 0.35f), shape)
                                .drawWithContent {
                                    drawContent()
                                    drawRoundRect(
                                        hsl(hue, 0.72f, 0.58f),
                                        cornerRadius = CornerRadius(5.dp.toPx()),
                                        style = Stroke(1.5.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 6f))),
                                    )
                                }
                        } else {
                            barModifier.background(hsl(hue, 0.72f, 0.5f), shape)
                        },
                        contentAlignment = Alignment.CenterEnd,
                    ) {
                        Text(
                            text,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Black,
                            color = if (row.extrapolated) PsyColors.fg else PsyColors.ink,
                            modifier = Modifier.padding(horizontal = 6.dp),
                        )
                    }
                }
            }
        }
    }
}
