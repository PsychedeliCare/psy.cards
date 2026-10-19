package cards.psy.app.ui.card

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import cards.psy.app.data.SubstanceCard
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.HatchPattern
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.theme.PsyColors
import kotlinx.coroutines.launch
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.roundToInt

private val FlipEasing = CubicBezierEasing(0.45f, 0.05f, 0.2f, 1f)
private val SpreadMinWidth = 760.dp
private val MaxCardWidth = 540.dp

/**
 * Two-sided substance card (web `.psy-deck`). Narrow: one card that flips
 * in 3D — from the side picker, the flip buttons, or a horizontal swipe the
 * card follows. Wide: both sides side by side.
 */
@Composable
fun SubstanceCardDeck(
    card: SubstanceCard,
    moleculeAsset: String?,
    onSelectCombo: (String) -> Unit,
    onShowAllCombos: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var sheet by remember { mutableIntStateOf(SHEET_NONE) }
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
        if (maxWidth >= SpreadMinWidth) {
            Row(
                Modifier.widthIn(max = MaxCardWidth * 2 + 20.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                var height by remember(card.key) { mutableIntStateOf(0) }
                val minHeight = with(LocalDensity.current) { height.toDp() }
                val measure = Modifier.weight(1f).heightIn(min = minHeight).onSizeChanged { if (it.height > height) height = it.height }
                CardSurface(card, front = true, modifier = measure) {
                    CardFront(card, moleculeAsset, 0f, onFlip = {}, onShowRoutes = { sheet = SHEET_ROUTES }, onShowCompare = { sheet = SHEET_COMPARE })
                }
                CardSurface(card, front = false, modifier = measure) {
                    CardBack(card, onFlip = {}, onSelectCombo, onShowAllCombos, onShowDependence = { sheet = SHEET_DEPENDENCE })
                }
            }
        } else {
            SingleCard(card, moleculeAsset, onSelectCombo, onShowAllCombos, onSheet = { sheet = it }, Modifier.widthIn(max = MaxCardWidth))
        }
    }
    when (sheet) {
        SHEET_ROUTES -> OtherRoutesSheet(card) { sheet = SHEET_NONE }
        SHEET_COMPARE -> MarginCompareSheet(card) { sheet = SHEET_NONE }
        SHEET_DEPENDENCE -> DependenceSheet(card) { sheet = SHEET_NONE }
    }
}

private const val SHEET_NONE = 0
private const val SHEET_ROUTES = 1
private const val SHEET_COMPARE = 2
private const val SHEET_DEPENDENCE = 3

@Composable
private fun SingleCard(
    card: SubstanceCard,
    moleculeAsset: String?,
    onSelectCombo: (String) -> Unit,
    onShowAllCombos: () -> Unit,
    onSheet: (Int) -> Unit,
    modifier: Modifier,
) {
    val pack = LocalPack.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val density = LocalDensity.current
    /** Cumulative flip angle, so each turn follows the gesture direction. */
    val angle = remember(card.key) { Animatable(0f) }
    var drag by remember(card.key) { mutableFloatStateOf(0f) }
    var widthPx by remember { mutableFloatStateOf(1f) }
    var faceHeight by remember(card.key) { mutableIntStateOf(0) }
    val total = angle.value + drag
    val showingBack = abs(((total % 360) + 360) % 360 - 180) < 90

    fun flip(direction: Int) {
        scope.launch {
            val start = angle.value + drag
            drag = 0f
            angle.snapTo(start)
            val target = ((start / 180).roundToInt() + direction) * 180f
            angle.animateTo(target, tween(720, easing = FlipEasing))
        }
        haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
    }

    Column(modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
        SingleChoiceSegmentedButtonRow(Modifier.testTag("side-picker")) {
            listOf(false to ("card.faceDose" to "scales-fill"), true to ("card.faceSafety" to "shield-warning-fill")).forEachIndexed { index, (back, label) ->
                SegmentedButton(
                    selected = showingBack == back,
                    onClick = { if (showingBack != back) flip(if (back) -1 else 1) },
                    shape = SegmentedButtonDefaults.itemShape(index, 2),
                    icon = { PhIcon(label.second, size = 15.dp) },
                    colors = SegmentedButtonDefaults.colors(
                        activeContainerColor = PsyColors.fg,
                        activeContentColor = PsyColors.ink,
                        inactiveContainerColor = PsyColors.fg.copy(alpha = 0.05f),
                        inactiveContentColor = PsyColors.fgMute,
                        activeBorderColor = PsyColors.fg.copy(alpha = 0.12f),
                        inactiveBorderColor = PsyColors.fg.copy(alpha = 0.12f),
                    ),
                    modifier = Modifier.testTag(if (back) "side-safety" else "side-dose"),
                ) { Text(pack.t(label.first), fontWeight = FontWeight.Bold, fontSize = 14.sp) }
            }
        }

        Box(
            Modifier
                .fillMaxWidth()
                .onSizeChanged { widthPx = it.width.toFloat().coerceAtLeast(1f) }
                .testTag("card-deck")
                .draggable(
                    orientation = Orientation.Horizontal,
                    state = rememberDraggableState { delta -> drag = (drag + delta / widthPx * 200).coerceIn(-170f, 170f) },
                    onDragStopped = { velocity ->
                        val dxPx = drag / 200 * widthPx
                        val projected = dxPx + velocity * 0.2f
                        if (abs(dxPx) >= with(density) { 48.dp.toPx() } || abs(projected) >= widthPx * 0.45f) {
                            flip(if ((if (abs(dxPx) >= with(density) { 48.dp.toPx() }) dxPx else projected) < 0) -1 else 1)
                        } else {
                            val start = drag
                            Animatable(start).animateTo(0f, spring(Spring.DampingRatioMediumBouncy, Spring.StiffnessMediumLow)) { drag = value }
                        }
                    },
                )
                .semantics {
                    customActions = listOf(
                        CustomAccessibilityAction(pack.t(if (showingBack) "card.flipToDose" else "card.flipToSafety")) {
                            flip(if (showingBack) 1 else -1)
                            true
                        },
                    )
                },
        ) {
            val minHeight = with(density) { maxOf(faceHeight, (widthPx * 1.35f).toInt()).toDp() }
            Face(total, back = false, minHeight) { h ->
                CardSurface(card, front = true, modifier = Modifier.onSizeChanged { if (it.height > faceHeight) faceHeight = it.height; h(it.height) }) {
                    CardFront(
                        card,
                        moleculeAsset,
                        swipe = drag / 180,
                        onFlip = { flip(-1) },
                        onShowRoutes = { onSheet(SHEET_ROUTES) },
                        onShowCompare = { onSheet(SHEET_COMPARE) },
                    )
                }
            }
            Face(total, back = true, minHeight) { h ->
                CardSurface(card, front = false, modifier = Modifier.onSizeChanged { if (it.height > faceHeight) faceHeight = it.height; h(it.height) }) {
                    CardBack(card, onFlip = { flip(1) }, onSelectCombo, onShowAllCombos, onShowDependence = { onSheet(SHEET_DEPENDENCE) })
                }
            }
        }
    }
}

/** One face of the card, shown depending on the (animated) flip angle. */
@Composable
private fun Face(total: Float, back: Boolean, minHeight: androidx.compose.ui.unit.Dp, content: @Composable ((Int) -> Unit) -> Unit) {
    val faceAngle = total + if (back) 180f else 0f
    val visible = cos(Math.toRadians(faceAngle.toDouble())) > 0
    val density = LocalDensity.current.density
    Box(
        Modifier
            .zIndex(if (visible) 1f else 0f)
            .heightIn(min = minHeight)
            .graphicsLayer {
                rotationY = faceAngle
                cameraDistance = 14f * density
                alpha = if (visible) 1f else 0f
            }
            .then(if (visible) Modifier else Modifier.clearAndSetSemantics {}),
        propagateMinConstraints = true,
    ) {
        content {}
    }
}

/**
 * The physical card: hue-washed face, accent along the top edge, soft
 * radial light and (on the back) fine diagonal hatching.
 */
@Composable
fun CardSurface(card: SubstanceCard, front: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val hue = PsyColors.group(card.group)
    val faceColor = PsyColors.face(card.group)
    val shape = RoundedCornerShape(26.dp)
    Box(
        modifier
            .fillMaxWidth()
            .shadow(22.dp, shape, ambientColor = Color.Black, spotColor = Color.Black)
            .clip(shape)
            .background(faceColor)
            .drawBehind {
                if (front) {
                    drawRect(Brush.radialGradient(listOf(hue.copy(alpha = 0.2f), Color.Transparent), center = Offset(size.width, 0f), radius = size.width * 1.1f))
                    drawRect(Brush.radialGradient(listOf(hue.copy(alpha = 0.08f), Color.Transparent), center = Offset(0f, size.height), radius = size.width * 0.8f))
                } else {
                    drawRect(Brush.radialGradient(listOf(hue.copy(alpha = 0.13f), Color.Transparent), center = Offset.Zero, radius = size.width * 0.9f))
                }
            }
            .border(1.dp, PsyColors.faceEdge, shape),
    ) {
        if (!front) HatchPattern(PsyColors.fg.copy(alpha = 0.022f), Modifier.matchParentSize(), spacing = 11.dp)
        Box(
            Modifier
                .fillMaxWidth()
                .padding(0.dp)
                .background(
                    Brush.horizontalGradient(listOf(lerp(hue, Color.Black, 0.1f), hue, lerp(hue, Color.White, 0.18f))),
                )
                .heightIn(min = 5.dp, max = 5.dp),
        )
        content()
    }
}
