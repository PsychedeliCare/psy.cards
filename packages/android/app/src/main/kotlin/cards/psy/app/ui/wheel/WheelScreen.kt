package cards.psy.app.ui.wheel

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.setProgress
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.R
import cards.psy.app.data.DataPack
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.substance.SubstanceCardContent
import cards.psy.app.ui.theme.PsyColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlin.math.sin

// Kotlin port of packages/web/src/lib/dial-geometry.ts — keep in sync.
// Degrees, 0° = north, clockwise; radii in the web's −100…100 unit space.
object Dial {
    const val HUB = 24f
    const val CATEGORY_OUTER = 50f
    const val SUBSTANCE_OUTER = 98f
    const val RIM = 98f
    const val SUBSTANCE_LABEL_RADIUS = 54f
    const val CATEGORY_LABEL_RADIUS = 44f
    const val CATEGORY_LABEL_INSET = 2f
    const val LABEL_BASE = 5.8f
    const val LABEL_MIN = 3.8f
    const val LABEL_MAX_WIDTH = 40f
    const val CATEGORY_LABEL_BASE = 5.2f
    const val CATEGORY_LABEL_MIN = 2.6f
    const val CATEGORY_TRACKING = 0.3f
    /** The selection marker sits at 90° (east) at every size. */
    const val DETENT = 90f

    fun normalize(deg: Float): Float = ((deg % 360) + 360) % 360
    fun distance(a: Float, b: Float): Float = abs(normalize(a) - normalize(b)).let { if (it > 180) 360 - it else it }
    fun activeIndex(mids: List<Float>, rotation: Float) =
        mids.indices.minByOrNull { distance(mids[it], normalize(DETENT - rotation)) } ?: 0
    fun rotationFor(mid: Float, current: Float): Float {
        val base = DETENT - mid
        return base + ((current - base) / 360).roundToInt() * 360
    }
    fun contains(angle: Float, start: Float, end: Float) = normalize(angle - start) < end - start
}

data class DialSubstance(val key: String, val label: String, val group: String, val start: Float, val end: Float) {
    val mid get() = (start + end) / 2
}

data class DialCategory(val group: String, val label: String, val start: Float, val end: Float, val substances: List<DialSubstance>) {
    val mid get() = (start + end) / 2
}

/** Same curated set as the web `/wheel`: visible groups, at most 4 substances each. */
fun buildDial(pack: DataPack, maxPerCategory: Int = 4): List<DialCategory> {
    val inputs = pack.groups.mapNotNull { g -> pack.substances.filter { it.group == g }.take(maxPerCategory).takeIf { it.isNotEmpty() }?.let { g to it } }
    if (inputs.isEmpty()) return emptyList()
    val step = 360f / inputs.size
    return inputs.mapIndexed { index, (group, subs) ->
        val start = -step / 2 + index * step
        val subStep = step / subs.size
        DialCategory(
            group,
            pack.groupLabel(group).uppercase(pack.javaLocale),
            start,
            start + step,
            subs.mapIndexed { i, s -> DialSubstance(s.key, s.label, s.group, start + i * subStep, start + (i + 1) * subStep) },
        )
    }
}

private val SnapEasing = CubicBezierEasing(0.33f, 1f, 0.68f, 1f)

@Composable
private fun SubstanceDial(
    categories: List<DialCategory>,
    diameter: Dp,
    selectedKey: String?,
    onSelect: (String) -> Unit,
    onActivate: (String) -> Unit,
) {
    val pack = LocalPack.current
    val substances = remember(categories) { categories.flatMap { it.substances } }
    val mids = remember(substances) { substances.map { it.mid } }
    val rotation = remember { Animatable(0f) }
    var labelRotation by remember { mutableFloatStateOf(0f) }
    /** Nothing is reported until the selection sits under the marker. */
    var seated by remember(substances) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val measurer = rememberTextMeasurer()
    /** The substance under the marker, always derived from the live rotation. */
    fun currentActive() = if (substances.isEmpty()) null else substances[Dial.activeIndex(mids, rotation.value)]
    val active = currentActive()

    fun snap(mid: Float, reference: Float = rotation.value) {
        scope.launch {
            val target = Dial.rotationFor(mid, reference)
            val duration = (280 + minOf(350f, abs(target - rotation.value) / 720 * 350)).toInt()
            rotation.animateTo(target, tween(duration, easing = SnapEasing))
            labelRotation = target
        }
    }

    // Seat the current selection under the marker on first layout.
    LaunchedEffect(substances) {
        val index = substances.indexOfFirst { it.key == selectedKey }.takeIf { it >= 0 } ?: 0
        if (substances.isNotEmpty()) {
            val target = Dial.rotationFor(substances[index].mid, rotation.value)
            rotation.snapTo(target)
            labelRotation = target
        }
        seated = true
    }
    // Report the substance under the marker, with a detent tick.
    LaunchedEffect(substances) {
        snapshotFlow { if (seated) currentActive()?.key else null }.collect { key ->
            if (key != null && key != selectedKey) {
                haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
                onSelect(key)
            }
        }
    }
    // External selection (picker, prev/next): bring it to the marker.
    LaunchedEffect(selectedKey) {
        val target = substances.firstOrNull { it.key == selectedKey } ?: return@LaunchedEffect
        if (target.key != currentActive()?.key) snap(target.mid)
    }

    Box(
        Modifier
            .size(diameter)
            .shadow(26.dp, CircleShape)
            .background(PsyColors.ink, CircleShape)
            .testTag("dial")
            .semantics {
                contentDescription = pack.t("dial.ariaLabel")
                stateDescription = active?.label ?: ""
                setProgress { value ->
                    val index = substances.indexOfFirst { it.key == currentActive()?.key }
                    val next = ((index + (if (value > 0) 1 else -1)) % substances.size + substances.size) % substances.size
                    snap(substances[next].mid)
                    true
                }
            }
            .pointerInput(substances) {
                val center = Offset(size.width / 2f, size.height / 2f)
                val scale = size.width / 200f
                fun angleOf(p: Offset) = (atan2((p.x - center.x).toDouble(), (-(p.y - center.y)).toDouble()) * 180 / PI).toFloat()
                awaitEachGesture {
                    val down = awaitFirstDown()
                    var previous = angleOf(down.position)
                    var current = rotation.value
                    var moved = false
                    val tracker = VelocityTracker()
                    var last = down.position
                    drag(down.id) { change ->
                        val angle = angleOf(change.position)
                        var delta = angle - previous
                        delta -= 360 * (delta / 360).roundToInt()
                        if (!moved && hypot(change.position.x - down.position.x, change.position.y - down.position.y) > 4.dp.toPx()) moved = true
                        if (moved) {
                            current += delta
                            val target = current
                            scope.launch { rotation.snapTo(target) }
                            if (abs(current - labelRotation) >= 30) labelRotation = current
                            change.consume()
                        }
                        previous = angle
                        tracker.addPosition(change.uptimeMillis, change.position)
                        last = change.position
                    }
                    if (!moved) {
                        // Tap: hub → open; category → centre it; substance → rotate it in.
                        val r = hypot(down.position.x - center.x, down.position.y - center.y) / scale
                        val local = Dial.normalize(angleOf(down.position) - rotation.value)
                        when {
                            r < Dial.HUB -> currentActive()?.let { onActivate(it.key) }
                            r < Dial.CATEGORY_OUTER -> categories.firstOrNull { Dial.contains(local, it.start, it.end) }?.let { snap(it.mid) }
                            r <= Dial.RIM + 2 -> substances.firstOrNull { Dial.contains(local, it.start, it.end) }?.let { snap(it.mid) }
                        }
                    } else {
                        // Fling: project the release angular velocity forward, then snap.
                        val v = tracker.calculateVelocity()
                        val dx = last.x - center.x
                        val dy = last.y - center.y
                        val omega = ((dx * v.y - dy * v.x) / maxOf(dx * dx + dy * dy, 1f) * 180 / PI).toFloat()
                        val projected = current + (omega * 0.15f).coerceIn(-720f, 720f)
                        snap(substances[Dial.activeIndex(mids, projected)].mid, projected)
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        val activeKey = active?.key
        Canvas(Modifier.fillMaxSize().graphicsLayer { rotationZ = rotation.value }) {
            drawDial(categories, substances, labelRotation, activeKey, measurer)
        }
        // Hub and rim are rotation invariant.
        Box(Modifier.size(diameter * (Dial.HUB * 2 / 200f)).background(PsyColors.ink, CircleShape), contentAlignment = Alignment.Center) {
            Text("PSY.CARDS", fontSize = (diameter.value * 3.4f / 200f).sp, fontWeight = FontWeight.Black, letterSpacing = (diameter.value * 0.7f / 200f).sp, color = PsyColors.fgMute)
        }
        Box(Modifier.fillMaxSize().border((diameter.value / 200f).dp, PsyColors.ink, CircleShape))
    }
}

private fun DrawScope.ringWedge(inner: Float, outer: Float, start: Float, end: Float, scale: Float): Path {
    val c = Offset(size.width / 2, size.height / 2)
    return Path().apply {
        arcTo(androidx.compose.ui.geometry.Rect(c, outer * scale), start - 90, end - start, forceMoveTo = true)
        arcTo(androidx.compose.ui.geometry.Rect(c, inner * scale), end - 90, -(end - start), forceMoveTo = false)
        close()
    }
}

private fun DrawScope.drawDial(
    categories: List<DialCategory>,
    substances: List<DialSubstance>,
    labelRotation: Float,
    activeKey: String?,
    measurer: TextMeasurer,
) {
    val scale = size.width / 200f
    val center = Offset(size.width / 2, size.height / 2)
    val stroke = Stroke(0.45f * scale)
    categories.forEach { cat ->
        val wedge = ringWedge(Dial.HUB, Dial.CATEGORY_OUTER, cat.start, cat.end, scale)
        drawPath(wedge, lerp(PsyColors.group(cat.group), Color.White, 0.12f))
        drawPath(wedge, PsyColors.ink, style = stroke)
    }
    substances.forEach { sub ->
        val wedge = ringWedge(Dial.CATEGORY_OUTER, Dial.SUBSTANCE_OUTER, sub.start, sub.end, scale)
        val isActive = sub.key == activeKey
        drawPath(wedge, if (isActive) lerp(PsyColors.group(sub.group), Color.White, 0.28f) else PsyColors.group(sub.group))
        drawPath(wedge, PsyColors.ink, style = Stroke((if (isActive) 1f else 0.45f) * scale))
    }

    // Substance labels: radial from r = 54, fitted to the rim, flipped on the western half.
    substances.forEach { sub ->
        val weight = if (sub.key == activeKey) FontWeight.Black else FontWeight.SemiBold
        var style = TextStyle(fontSize = (Dial.LABEL_BASE * scale / density).sp, fontWeight = weight, color = PsyColors.ink)
        var layout = measurer.measure(sub.label, style)
        val maxWidth = Dial.LABEL_MAX_WIDTH * scale
        if (layout.size.width > maxWidth) {
            val fitted = maxOf(Dial.LABEL_MIN * scale, Dial.LABEL_BASE * scale * maxWidth / layout.size.width)
            style = style.copy(fontSize = (fitted / density).sp)
            layout = measurer.measure(sub.label, style)
        }
        val flipped = Dial.distance(sub.mid + labelRotation, 270f) < 90
        rotate(sub.mid - 90 + if (flipped) 180f else 0f, pivot = center) {
            val r = Dial.SUBSTANCE_LABEL_RADIUS * scale * (if (flipped) -1 else 1)
            val x = center.x + r - if (flipped) layout.size.width else 0
            drawText(layout, topLeft = Offset(x, center.y - layout.size.height / 2f))
        }
    }

    // Category labels: glyph by glyph along an arc at r = 44, reversed on the lower half.
    categories.forEach { cat ->
        val radius = Dial.CATEGORY_LABEL_RADIUS * scale
        val span = cat.end - cat.start - 2 * Dial.CATEGORY_LABEL_INSET
        val budget = radius * (span * PI.toFloat() / 180) - 2 * scale
        val tracking = Dial.CATEGORY_TRACKING * scale
        fun glyphs(px: Float) = cat.label.map { measurer.measure(it.toString(), TextStyle(fontSize = (px / density).sp, fontWeight = FontWeight.Bold, color = PsyColors.ink)) }
        var px = Dial.CATEGORY_LABEL_BASE * scale
        var run = glyphs(px)
        var total = run.sumOf { it.size.width } + tracking * (cat.label.length - 1).coerceAtLeast(0)
        if (total > budget) {
            px = maxOf(Dial.CATEGORY_LABEL_MIN * scale, px * budget / total)
            run = glyphs(px)
            total = run.sumOf { it.size.width } + tracking * (cat.label.length - 1).coerceAtLeast(0)
        }
        val reversed = Dial.distance(cat.mid + labelRotation, 192f) < 90
        val degPerPx = 180f / (PI.toFloat() * radius)
        var cursor = cat.mid + if (reversed) total * degPerPx / 2 else -total * degPerPx / 2
        run.forEach { glyph ->
            val widthDeg = glyph.size.width * degPerPx
            val angle = if (reversed) cursor - widthDeg / 2 else cursor + widthDeg / 2
            val rad = angle * PI.toFloat() / 180
            val pos = Offset(center.x + radius * sin(rad), center.y - radius * cos(rad))
            rotate(angle + if (reversed) 180f else 0f, pivot = pos) {
                drawText(glyph, topLeft = Offset(pos.x - glyph.size.width / 2f, pos.y - glyph.size.height / 2f))
            }
            cursor += (if (reversed) -1 else 1) * (widthDeg + tracking * degPerPx)
        }
    }
}

/**
 * `/wheel`: the jog dial as a supplementary navigator, with the same
 * two-sided card as everywhere else below it (beside it on wide screens).
 */
@Composable
fun WheelScreen(
    selectedKey: String?,
    onSelect: (String) -> Unit,
    onOpenSubstance: (String) -> Unit,
    header: @Composable () -> Unit,
    contentPadding: PaddingValues,
) {
    val pack = LocalPack.current
    val categories = remember(pack) { buildDial(pack) }
    var displayed by remember { mutableStateOf(selectedKey) }
    LaunchedEffect(selectedKey) {
        if (displayed == null) displayed = selectedKey else {
            delay(180)
            displayed = selectedKey
        }
    }
    val explorer: @Composable (Dp) -> Unit = { diameter ->
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Box(contentAlignment = Alignment.CenterEnd) {
                SubstanceDial(categories, diameter, selectedKey, onSelect, onOpenSubstance)
                Canvas(Modifier.offset(x = 14.dp).size(9.dp, 12.dp)) {
                    drawPath(Path().apply { moveTo(size.width, 0f); lineTo(0f, size.height / 2); lineTo(size.width, size.height); close() }, PsyColors.fg)
                }
            }
            Text(pack.t("dial.hint"), fontSize = 12.sp, color = PsyColors.fgMute, modifier = Modifier.padding(top = 14.dp, bottom = 18.dp))
            SelectionControl(categories, selectedKey, onSelect)
        }
    }
    val card: @Composable () -> Unit = {
        AnimatedContent(displayed, transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "wheel-card") { key ->
            key?.let { pack.substance(it) }?.let { SubstanceCardContent(it, onOpenSubstance) }
        }
    }

    BoxWithConstraints(Modifier.fillMaxSize()) {
        val width = maxWidth
        val height = maxHeight
        if (width > 900.dp) {
            Row(Modifier.fillMaxSize().padding(contentPadding)) {
                Column(Modifier.weight(0.42f).padding(top = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    header()
                    explorer(minOf(width * 0.36f, height - 260.dp, 520.dp))
                }
                Column(Modifier.weight(0.58f).verticalScroll(rememberScrollState()).padding(20.dp)) { card() }
            }
        } else {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(contentPadding).padding(horizontal = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                header()
                explorer(minOf(width - 40.dp, 420.dp))
                Box(Modifier.padding(top = 24.dp)) { card() }
            }
        }
    }
}

@Composable
private fun SelectionControl(categories: List<DialCategory>, selectedKey: String?, onSelect: (String) -> Unit) {
    val pack = LocalPack.current
    val substances = categories.flatMap { it.substances }
    val current = substances.firstOrNull { it.key == selectedKey }
    var menu by remember { mutableStateOf(false) }
    fun move(delta: Int) {
        if (substances.isEmpty()) return
        val index = substances.indexOfFirst { it.key == selectedKey }.coerceAtLeast(0)
        onSelect(substances[((index + delta) % substances.size + substances.size) % substances.size].key)
    }
    Surface(
        shape = RoundedCornerShape(22.dp),
        color = lerp(PsyColors.ink2, PsyColors.group(current?.group ?: ""), 0.1f),
        border = androidx.compose.foundation.BorderStroke(1.dp, PsyColors.fg.copy(alpha = 0.14f)),
        modifier = Modifier.widthIn(max = 480.dp).fillMaxWidth(),
    ) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            StepButton(R.drawable.ph_caret_left_bold, pack.t("dial.previous")) { move(-1) }
            Box(Modifier.weight(1f), contentAlignment = Alignment.Center) {
                Surface(onClick = { menu = true }, color = Color.Transparent, contentColor = PsyColors.fg, modifier = Modifier.semantics { contentDescription = pack.t("dial.choose") }) {
                    Column(Modifier.padding(vertical = 4.dp, horizontal = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(current?.let { pack.groupLabel(it.group).uppercase() } ?: "", fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.9.sp, color = PsyColors.fgMute)
                        Text(current?.label ?: "", fontSize = 20.sp, fontWeight = FontWeight.Black)
                    }
                }
                DropdownMenu(menu, onDismissRequest = { menu = false }) {
                    categories.forEach { cat ->
                        Text(pack.groupLabel(cat.group), fontSize = 12.sp, fontWeight = FontWeight.Bold, color = PsyColors.group(cat.group), modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                        cat.substances.forEach { sub ->
                            DropdownMenuItem(text = { Text(sub.label, fontWeight = if (sub.key == selectedKey) FontWeight.Black else FontWeight.Normal) }, onClick = { menu = false; onSelect(sub.key) })
                        }
                    }
                }
            }
            StepButton(R.drawable.ph_caret_right_bold, pack.t("dial.next")) { move(1) }
        }
    }
}

@Composable
private fun StepButton(icon: Int, label: String, onClick: () -> Unit) {
    FilledTonalIconButton(
        onClick = onClick,
        modifier = Modifier.size(46.dp).semantics { contentDescription = label },
        colors = IconButtonDefaults.filledTonalIconButtonColors(containerColor = PsyColors.ink3, contentColor = PsyColors.fg),
    ) {
        Icon(painterResource(icon), null, Modifier.size(18.dp))
    }
}
