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
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import cards.psy.app.data.ToxicityMargin
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.HatchPattern
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
 * Compact dose scale (web `card/DoseScale.astro`): coloured ranges on a
 * shared track, level names above and boundary amounts below, placed
 * without collisions against the real text widths.
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
            Box(Modifier.padding(vertical = 5.dp).fillMaxWidth().height(9.dp)) {
                DoseTrack(chart, face, Modifier.matchParentSizeCompat())
                if (markerFraction >= 0f) {
                    val trackHeight = 9.dp
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

private fun Modifier.matchParentSizeCompat() = this.then(Modifier.fillMaxWidth().height(9.dp))

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
        val h = size.height
        drawRoundRect(PsyColors.fg.copy(alpha = 0.09f), cornerRadius = CornerRadius(h / 2))
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

// ---------------------------------------------------------------- Margin

/** Log-scale position (1× → 0, 1000× → 1) shared by the meter and the chart. */
private fun logPosition(ratio: Double) = (log10(ratio) / 3).coerceIn(0.0, 1.0).toFloat()

/**
 * Toxicity margin meter (web `.psy-margin`): lethal ÷ usual dose on a log
 * track from red to green, with alcohol as a familiar reference point.
 */
@Composable
fun MarginMeter(margin: ToxicityMargin?, danger: Boolean, alcoholRatio: Double?, face: Color, modifier: Modifier = Modifier) {
    val pack = LocalPack.current
    val trackHeight = 8.dp
    val bubbleHeight = 22.dp
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(5.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth().height(if (margin == null) trackHeight else bubbleHeight + 7.dp + trackHeight)) {
            val width = maxWidth
            val trackTop = if (margin == null) 0.dp else bubbleHeight + 7.dp
            val trackModifier = Modifier.offset(y = trackTop).fillMaxWidth().height(trackHeight).clip(CircleShape)
            if (margin == null) {
                HatchPattern(
                    color = if (danger) PsyColors.emergency.copy(alpha = 0.7f) else PsyColors.fg.copy(alpha = 0.22f),
                    background = if (danger) PsyColors.emergency.copy(alpha = 0.2f) else PsyColors.fg.copy(alpha = 0.06f),
                    spacing = 7.dp,
                    lineWidth = 3.2.dp,
                    modifier = trackModifier,
                )
            } else {
                Box(trackModifier.background(Brush.horizontalGradient(*PsyColors.marginStops)))
            }
            if (alcoholRatio != null) {
                Box(
                    Modifier
                        .offset(x = width * logPosition(alcoholRatio) - trackHeight * 1.05f, y = trackTop - trackHeight * 0.55f)
                        .size(trackHeight * 2.1f)
                        .background(PsyColors.fg.copy(alpha = 0.88f), CircleShape),
                    contentAlignment = Alignment.Center,
                ) { PhIcon("wine-fill", size = trackHeight * 1.15f, tint = PsyColors.ink) }
            }
            if (margin != null) {
                val fraction = logPosition(margin.ratio)
                val text = "${if (margin.atLeast) ">" else ""}${pack.number(margin.ratio)}×"
                // The bubble slides so it never leaves the track; its pointer
                // stays exactly on the value (web translateX(-x)).
                Layout(content = { MarginBubble(text, margin.extrapolated, face, bubbleHeight) }) { measurables, constraints ->
                    val bubble = measurables.first().measure(constraints.copy(minWidth = 0))
                    layout(constraints.maxWidth, bubble.height) {
                        bubble.placeRelative(((constraints.maxWidth - bubble.width) * fraction).toInt(), 0)
                    }
                }
                Canvas(Modifier.offset(x = width * fraction - 5.dp, y = bubbleHeight + 1.dp).size(10.dp, 6.dp)) {
                    drawPath(Path().apply { moveTo(0f, 0f); lineTo(size.width, 0f); lineTo(size.width / 2, size.height); close() }, PsyColors.fg)
                }
            }
        }
        BoxWithConstraints(Modifier.fillMaxWidth().height(16.dp)) {
            val labels = listOf("1×", "10×", "100×", "1000×")
            labels.forEachIndexed { index, label ->
                val measured = with(density) { measurer.measure(label, TextStyle(fontSize = 10.sp)).size.width.toDp() }
                val x = when (index) {
                    0 -> 0.dp
                    3 -> maxWidth - measured
                    else -> maxWidth * (index / 3f) - measured / 2
                }
                Text(label, fontSize = 10.sp, color = PsyColors.fgMute, modifier = Modifier.offset(x = x))
            }
        }
    }
}

@Composable
private fun MarginBubble(text: String, estimate: Boolean, face: Color, height: Dp) {
    val base = Modifier
        .height(height)
        .shadow(4.dp, CircleShape)
    Box(
        if (estimate) {
            base.background(face, CircleShape).drawWithContent {
                drawContent()
                drawRoundRect(
                    PsyColors.fg,
                    cornerRadius = CornerRadius(size.height / 2),
                    style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 4f))),
                )
            }
        } else {
            base.background(PsyColors.fg, CircleShape)
        }.padding(horizontal = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            fontSize = 12.sp,
            fontWeight = FontWeight.Black,
            color = if (estimate) PsyColors.fg else PsyColors.ink,
            maxLines = 1,
            modifier = Modifier.wrapContentSize(),
        )
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
