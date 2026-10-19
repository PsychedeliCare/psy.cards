package cards.psy.app.ui.substance

import android.text.format.DateFormat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.TimePickerDialog
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.TimingValue
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.theme.PsyColors
import java.util.Calendar
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

private data class CurvePoint(val hour: Double, val intensity: Double)
private data class Marker(val hour: Double, val intensity: Double, val label: String?)
private data class Range(val min: Double, val max: Double) { val average get() = (min + max) / 2 }

private fun range(timing: TimingValue?): Range? {
    val value = timing?.value?.lowercase() ?: return null
    if ("unknown" in value) return null
    val unit = timing.unit.lowercase()
    val multiplier = when {
        "sec" in unit -> 1.0 / 3600
        "min" in unit -> 1.0 / 60
        "day" in unit -> 24.0
        else -> 1.0
    }
    val numbers = Regex("""\d+(?:\.\d+)?""").findAll(value).map { it.value.toDouble() }.toList()
    val first = numbers.firstOrNull() ?: return null
    val second = numbers.getOrElse(1) { first }
    return Range(min(first, second) * multiplier, max(first, second) * multiplier)
}

/** Effect curve geometry (port of packages/web/src/scripts/timing-chart.ts). */
private fun geometry(onset: Range?, duration: Range): Triple<List<CurvePoint>, List<Marker>, Double> {
    fun clamp(v: Double, lo: Double, hi: Double) = min(max(v, lo), hi)
    val durationEnd = max(duration.average, duration.max)
    // Keep the final whole-hour tick inside the plotted domain.
    val maxHour = max(ceil(durationEnd * 1.08), 1.0)
    val onsetStart = onset?.min ?: max(durationEnd * 0.05, 0.05)
    val onsetEnd = onset?.max ?: max(durationEnd * 0.16, onsetStart)
    val onsetMid = onset?.average ?: ((onsetStart + onsetEnd) / 2)
    val activeWindow = maxOf(durationEnd - onsetEnd, durationEnd * 0.35, 0.5)
    val peakHour = clamp(onsetEnd + activeWindow * 0.3, onsetEnd + 0.12, durationEnd * 0.72)
    val prePeak = clamp(onsetEnd + (peakHour - onsetEnd) * 0.5, onsetEnd, peakHour)
    val plateauEnd = clamp(peakHour + activeWindow * 0.18, peakHour, durationEnd * 0.82)
    val comedownMid = clamp(plateauEnd + (durationEnd - plateauEnd) * 0.45, plateauEnd, durationEnd)
    val tailStart = clamp(durationEnd - max(activeWindow * 0.12, 0.12), comedownMid, durationEnd)
    val raw = listOf(
        CurvePoint(0.0, 0.0), CurvePoint(onsetStart, 0.04), CurvePoint(onsetMid, 0.18), CurvePoint(onsetEnd, 0.45),
        CurvePoint(prePeak, 0.82), CurvePoint(peakHour, 1.0), CurvePoint(plateauEnd, 0.88), CurvePoint(comedownMid, 0.32),
        CurvePoint(tailStart, 0.08), CurvePoint(durationEnd, 0.0),
    ).sortedBy { it.hour }
    val points = mutableListOf<CurvePoint>()
    for (point in raw) {
        val last = points.lastOrNull()
        if (last != null && abs(last.hour - point.hour) < 0.01) points[points.size - 1] = CurvePoint(last.hour, max(last.intensity, point.intensity))
        else points += point
    }
    val markers = buildList {
        onset?.let { add(Marker(it.average, 0.4, "onset")) }
        add(Marker(peakHour, 1.0, "peak"))
        add(Marker(durationEnd, 0.02, null))
    }
    return Triple(points, markers, maxHour)
}

private fun ticks(maxHour: Double): List<Double> {
    val step = when {
        maxHour <= 4 -> 1.0
        maxHour <= 8 -> 2.0
        maxHour <= 18 -> 4.0
        maxHour <= 36 -> 6.0
        else -> 12.0
    }
    return generateSequence(0.0) { it + step }.takeWhile { it <= maxHour }.take(7).toList()
}

/** Monotone cubic (Fritsch–Carlson) path through the curve points. */
private fun monotonePath(points: List<Offset>): Path {
    val path = Path()
    if (points.isEmpty()) return path
    path.moveTo(points[0].x, points[0].y)
    val n = points.size
    val slopes = DoubleArray(n)
    val d = DoubleArray(n - 1) { (points[it + 1].y - points[it].y).toDouble() / (points[it + 1].x - points[it].x).coerceAtLeast(0.001f) }
    slopes[0] = d.firstOrNull() ?: 0.0
    slopes[n - 1] = d.lastOrNull() ?: 0.0
    for (i in 1 until n - 1) slopes[i] = if (d[i - 1] * d[i] <= 0) 0.0 else 2 / (1 / d[i - 1] + 1 / d[i])
    for (i in 0 until n - 1) {
        val p0 = points[i]
        val p1 = points[i + 1]
        val dx = (p1.x - p0.x) / 3
        path.cubicTo(p0.x + dx, (p0.y + slopes[i] * dx).toFloat(), p1.x - dx, (p1.y - slopes[i + 1] * dx).toFloat(), p1.x, p1.y)
    }
    return path
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TimingChart(onset: TimingValue?, duration: TimingValue?, tint: Color, description: String) {
    val pack = LocalPack.current
    val context = LocalContext.current
    val durationRange = range(duration) ?: return
    val (points, markers, maxHour) = remember(onset, duration) { geometry(range(onset), durationRange) }
    val tickHours = remember(maxHour) { ticks(maxHour) }
    val measurer = rememberTextMeasurer()
    var start by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var picking by remember { mutableStateOf(false) }
    val clock = DateFormat.getTimeFormat(context)

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Canvas(Modifier.fillMaxWidth().height(190.dp).semantics { contentDescription = description }) {
            val top = 22.dp.toPx()
            val bottom = size.height - 22.dp.toPx()
            val plotHeight = bottom - top
            fun x(hour: Double) = (hour / maxHour * size.width).toFloat()
            fun y(intensity: Double) = (bottom - intensity / 1.32 * plotHeight).toFloat()

            drawRoundRect(PsyColors.fg.copy(alpha = 0.03f), Offset(0f, top), androidx.compose.ui.geometry.Size(size.width, plotHeight), CornerRadius(8.dp.toPx()))
            val labelStyle = TextStyle(fontSize = 10.sp, color = PsyColors.fgMute, fontFeatureSettings = "tnum")
            tickHours.forEach { hour ->
                val tx = x(hour)
                drawLine(PsyColors.fg.copy(alpha = 0.12f), Offset(tx, top), Offset(tx, bottom), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 8f)))
                val relative = measurer.measure("+${hour.toInt()}h", labelStyle)
                drawText(relative, topLeft = Offset((tx - relative.size.width / 2f).coerceIn(0f, size.width - relative.size.width), 0f))
                val time = Calendar.getInstance().apply { timeInMillis = start + (hour * 3_600_000).toLong() }.time
                val absolute = measurer.measure(clock.format(time), labelStyle)
                drawText(absolute, topLeft = Offset((tx - absolute.size.width / 2f).coerceIn(0f, size.width - absolute.size.width), size.height - absolute.size.height))
            }

            val offsets = points.map { Offset(x(it.hour), y(it.intensity)) }
            val line = monotonePath(offsets)
            val area = Path().apply {
                addPath(line)
                lineTo(offsets.last().x, bottom)
                lineTo(offsets.first().x, bottom)
                close()
            }
            drawPath(area, Brush.verticalGradient(listOf(tint.copy(alpha = 0.4f), tint.copy(alpha = 0f)), startY = top, endY = bottom))
            drawPath(line, tint, style = Stroke(2.4.dp.toPx(), cap = StrokeCap.Round))

            markers.forEach { marker ->
                val center = Offset(x(marker.hour), y(marker.intensity))
                drawLine(PsyColors.fg.copy(alpha = 0.2f), Offset(center.x, top), Offset(center.x, bottom), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                drawCircle(PsyColors.ink, 5.dp.toPx(), center)
                drawCircle(PsyColors.fg, 5.dp.toPx(), center, style = Stroke(2.dp.toPx()))
                marker.label?.let { key ->
                    val text = measurer.measure(pack.t("timingChart.$key").uppercase(), TextStyle(fontSize = 10.sp, fontWeight = FontWeight.Black, letterSpacing = 0.6.sp, color = PsyColors.fg))
                    val padX = 7.dp.toPx()
                    val w = text.size.width + padX * 2
                    val h = text.size.height + 4.dp.toPx()
                    val left = (center.x - w / 2).coerceIn(0f, size.width - w)
                    val labelTop = (center.y - h - 8.dp.toPx()).coerceAtLeast(top + 2.dp.toPx())
                    drawRoundRect(PsyColors.ink3, Offset(left, labelTop), androidx.compose.ui.geometry.Size(w, h), CornerRadius(h / 2))
                    drawText(text, topLeft = Offset(left + padX, labelTop + 2.dp.toPx()))
                }
            }
        }
        Row {
            Text(pack.t("timingChart.startTime"), fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = PsyColors.fgMute, modifier = Modifier.padding(top = 10.dp))
            Spacer(Modifier.weight(1f))
            Surface(onClick = { picking = true }, shape = CircleShape, color = PsyColors.fg.copy(alpha = 0.08f), contentColor = PsyColors.fg) {
                Text(clock.format(java.util.Date(start)), fontSize = 16.sp, modifier = Modifier.background(Color.Transparent).padding(horizontal = 16.dp, vertical = 8.dp))
            }
        }
    }

    if (picking) {
        val calendar = Calendar.getInstance().apply { timeInMillis = start }
        val state = rememberTimePickerState(calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), DateFormat.is24HourFormat(context))
        TimePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton({
                    start = calendar.apply { set(Calendar.HOUR_OF_DAY, state.hour); set(Calendar.MINUTE, state.minute) }.timeInMillis
                    picking = false
                }) { Text("OK") }
            },
            title = { Text(pack.t("timingChart.startTime")) },
        ) { TimePicker(state) }
    }
}
