package cards.psy.app.ui.card

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import cards.psy.app.generated.GeneratedMolecules
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** Device tilt (−1…1 on each axis) from the gravity sensor; null without one. */
@Composable
private fun rememberTilt(enabled: Boolean): Offset? {
    val context = LocalContext.current
    var tilt by remember { mutableStateOf<Offset?>(null) }
    DisposableEffect(enabled) {
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val sensor = manager?.getDefaultSensor(Sensor.TYPE_GRAVITY) ?: manager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        if (!enabled || manager == null || sensor == null) return@DisposableEffect onDispose {}
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                // Held upright, gravity points down the screen (y ≈ 9.8 · 0.6–0.8).
                val target = Offset(
                    (-event.values[0] / SensorManager.GRAVITY_EARTH * 1.6f).coerceIn(-1f, 1f),
                    ((event.values[1] / SensorManager.GRAVITY_EARTH - 0.6f) * -1.6f).coerceIn(-1f, 1f),
                )
                val current = tilt ?: target
                tilt = current + (target - current) * 0.18f
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
        }
        manager.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_UI)
        onDispose { manager.unregisterListener(listener) }
    }
    return tilt
}

private fun animationsDisabled(context: Context) =
    Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

/**
 * Holographic molecule in the card's top-right corner (web
 * `.substance-hologram`, adapted from vgpu's Holographic Card, MIT): pearl
 * foil strokes and faint engraving that catch a light band as the device
 * tilts.
 */
@Composable
fun MoleculeHologram(assetName: String, swipe: Float, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val reduceMotion = remember { animationsDisabled(context) }
    val sensorTilt = rememberTilt(enabled = !reduceMotion)
    val drift = rememberInfiniteTransition(label = "drift")
    val phase by drift.animateFloat(0f, (2 * PI).toFloat(), infiniteRepeatable(tween(14_000, easing = LinearEasing), RepeatMode.Restart), label = "phase")
    val tilt = when {
        reduceMotion -> Offset(0.35f, -0.25f)
        sensorTilt != null -> sensorTilt
        else -> Offset(sin(phase) * 0.75f, cos(phase * 0.7f) * 0.45f)
    } + Offset(swipe, 0f)
    val strength = if (reduceMotion) 0.6f else 1f
    val molecule = GeneratedMolecules.byAsset[assetName] ?: return

    Box(
        modifier
            .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
            .drawWithContent {
                drawContent()
                // Fade towards the card's centre and lower edge (web `region`/`fade`).
                drawRect(
                    Brush.radialGradient(
                        0f to Color.White,
                        0.55f to Color.White.copy(alpha = 0.7f),
                        1f to Color.Transparent,
                        center = Offset(size.width * 0.62f, size.height * 0.38f),
                        radius = size.width * 0.72f,
                    ),
                    blendMode = BlendMode.DstIn,
                )
            },
    ) {
        EngravedRings(tilt, strength, Modifier.fillMaxSize())
        Image(
            painterResource(molecule),
            contentDescription = null,
            contentScale = ContentScale.Fit,
            modifier = Modifier
                .fillMaxSize()
                .padding(18.dp)
                .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
                .drawWithContent {
                    drawContent()
                    // Recolour the strokes: cool ink, pearl foil and a sharp glint.
                    drawRect(Color(0xFFB8C2CC).copy(alpha = 0.26f), blendMode = BlendMode.SrcIn)
                    drawRect(pearlBrush(tilt, size.width, size.height), alpha = 0.36f * strength, blendMode = BlendMode.SrcAtop)
                    drawRect(lightBand(tilt, 0.22f, size.width, size.height), alpha = 0.55f * strength, blendMode = BlendMode.SrcAtop)
                    drawRect(lightBand(tilt, 0.05f, size.width, size.height), alpha = 0.5f * strength, blendMode = BlendMode.SrcAtop)
                },
        )
    }
}

/** Pearlescent palette (web `pearlColor`): a cosine palette swept by tilt. */
private val pearlStops: List<Color> = (0..6).map { step ->
    val phase = step / 6.0
    fun channel(base: Double, amplitude: Double, offset: Double) = (base + amplitude * cos(2 * PI * (phase + offset))).toFloat().coerceIn(0f, 1f)
    Color(channel(0.55, 0.43, 0.05), channel(0.52, 0.40, 0.38), channel(0.64, 0.34, 0.63))
}

private fun pearlBrush(tilt: Offset, width: Float, height: Float) = Brush.sweepGradient(
    pearlStops,
    center = Offset(width * (0.5f + tilt.x * 0.35f), height * (0.5f + tilt.y * 0.35f)),
)

/** A diagonal band of light whose position follows the tilt. */
private fun lightBand(tilt: Offset, width: Float, w: Float, h: Float): Brush {
    val center = 0.5f + (tilt.x * 0.72f + tilt.y * 0.52f) * 0.45f
    return Brush.linearGradient(
        (center - width).coerceIn(0f, 1f) to Color.Transparent,
        center.coerceIn(0f, 1f) to Color.White,
        (center + width).coerceIn(0f, 1f) to Color.Transparent,
        start = Offset.Zero,
        end = Offset(w, h),
    )
}

/** Warped concentric engraving and a fine dot grid (web `etchedPhase`). */
@Composable
private fun EngravedRings(tilt: Offset, strength: Float, modifier: Modifier) {
    Canvas(modifier.graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)) {
        val center = Offset(size.width * 0.565f, size.height * 0.54f)
        val spacing = 4.2.dp.toPx()
        var radius = spacing
        while (radius < size.width * 0.9f) {
            drawOval(
                Color.White.copy(alpha = 0.03f),
                topLeft = Offset(center.x - radius, center.y - radius * 0.76f),
                size = androidx.compose.ui.geometry.Size(radius * 2, radius * 1.52f),
                style = Stroke(0.6.dp.toPx()),
            )
            radius += spacing
        }
        val step = size.width / 20
        var y = step / 2
        while (y < size.height) {
            var x = step / 2
            while (x < size.width) {
                drawCircle(Color.White.copy(alpha = 0.03f), 0.5.dp.toPx(), Offset(x, y))
                x += step
            }
            y += step
        }
        // The light band brightens the engraving it passes over.
        drawRect(lightBand(tilt, 0.32f, size.width, size.height), alpha = 0.12f * strength, blendMode = BlendMode.SrcAtop)
    }
}
