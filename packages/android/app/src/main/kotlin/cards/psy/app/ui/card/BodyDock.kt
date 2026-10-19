package cards.psy.app.ui.card

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cards.psy.app.data.Sex
import cards.psy.app.data.WeightUnit
import cards.psy.app.ui.LocalBody
import cards.psy.app.ui.LocalPack
import cards.psy.app.ui.components.PhIcon
import cards.psy.app.ui.theme.PsyColors
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Floating body profile (sex + weight) that personalises dose tiles (web
 * `BodyDock.astro`). Folds into a small pill; values never leave the device.
 */
@Composable
fun BodyDock(modifier: Modifier = Modifier) {
    val body = LocalBody.current
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(body.snapshot.weightKg, body.snapshot.sex) {
        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
    }
    AnimatedContent(
        targetState = body.dockCollapsed,
        transitionSpec = {
            (fadeIn() + scaleIn(spring(Spring.DampingRatioLowBouncy, Spring.StiffnessMediumLow), initialScale = 0.85f)) togetherWith
                (fadeOut() + scaleOut(targetScale = 0.85f))
        },
        contentAlignment = Alignment.BottomEnd,
        modifier = modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 6.dp),
        label = "dock",
    ) { collapsed ->
        if (collapsed) CollapsedDock() else ExpandedDock()
    }
}

@Composable
private fun CollapsedDock() {
    val pack = LocalPack.current
    val body = LocalBody.current
    val summary = body.displayWeight?.let {
        val mark = when (body.sex) { Sex.male -> "♂ "; Sex.female -> "♀ "; null -> "" }
        "$mark${pack.number(it)} ${body.unit.name}"
    } ?: pack.t("body.show")
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Surface(
            onClick = { body.collapseDock(false) },
            shape = CircleShape,
            color = PsyColors.ink3,
            contentColor = PsyColors.fg,
            shadowElevation = 10.dp,
            border = androidx.compose.foundation.BorderStroke(1.dp, PsyColors.fg.copy(alpha = 0.1f)),
            modifier = Modifier.testTag("dock-show").semantics { contentDescription = pack.t("body.show") },
        ) {
            Row(
                Modifier.height(48.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                PhIcon("user-fill", size = 16.dp)
                Text(summary, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ExpandedDock() {
    val pack = LocalPack.current
    val body = LocalBody.current
    val focus = LocalFocusManager.current
    Surface(
        shape = CircleShape,
        color = PsyColors.ink3,
        contentColor = PsyColors.fg,
        shadowElevation = 12.dp,
        border = androidx.compose.foundation.BorderStroke(1.dp, PsyColors.fg.copy(alpha = 0.1f)),
        modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp).semantics { contentDescription = pack.t("body.title") },
    ) {
        Row(
            Modifier.height(60.dp).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            PhIcon("user-fill", size = 17.dp, tint = PsyColors.fgMute, modifier = Modifier.padding(start = 6.dp))

            // Sex
            Row(
                Modifier.background(PsyColors.fg.copy(alpha = 0.07f), CircleShape).padding(2.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Sex.entries.forEach { sex ->
                    val selected = body.sex == sex
                    Box(
                        Modifier
                            .size(42.dp)
                            .background(if (selected) PsyColors.fg else PsyColors.fg.copy(alpha = 0f), CircleShape)
                            .testTag(if (sex == Sex.male) "dock-male" else "dock-female")
                            .selectable(selected = selected, role = Role.RadioButton) { body.toggleSex(sex) }
                            .semantics { contentDescription = pack.t(if (sex == Sex.male) "body.male" else "body.female") },
                        contentAlignment = Alignment.Center,
                    ) {
                        PhIcon(
                            if (sex == Sex.male) "gender-male-bold" else "gender-female-bold",
                            size = 18.dp,
                            tint = if (selected) PsyColors.ink else PsyColors.fg,
                        )
                    }
                }
            }

            // Weight
            Row(
                Modifier.background(PsyColors.fg.copy(alpha = 0.07f), CircleShape).padding(horizontal = 2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                RepeatButton("minus", pack.t("body.decrease"), "dock-minus") { body.stepWeight(-1) }
                WeightField()
                Text(
                    body.unit.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PsyColors.fgMute,
                    modifier = Modifier
                        .clickable(role = Role.Button) {
                            focus.clearFocus()
                            body.setUnit(if (body.unit == WeightUnit.kg) WeightUnit.lb else WeightUnit.kg)
                        }
                        .padding(horizontal = 3.dp, vertical = 12.dp)
                        .semantics { contentDescription = "${pack.t("body.weight")}: ${body.unit.name}" },
                )
                RepeatButton("plus", pack.t("body.increase"), "dock-plus") { body.stepWeight(1) }
            }

            Spacer(Modifier.weight(1f))

            Switch(
                checked = body.remember,
                onCheckedChange = { body.setRemember(it) },
                colors = SwitchDefaults.colors(checkedTrackColor = PsyColors.saveOn, checkedThumbColor = PsyColors.fg),
                modifier = Modifier.semantics {
                    contentDescription = pack.t("body.save")
                    stateDescription = "${pack.t("body.saveHint")}. ${pack.t("body.privacyDevice")}"
                },
            )
            IconButton(onClick = { focus.clearFocus(); body.collapseDock(true) }, modifier = Modifier.size(36.dp).testTag("dock-hide")) {
                Icon(painterResource(cards.psy.app.R.drawable.ph_caret_down_bold), pack.t("body.hide"), tint = PsyColors.fgMute, modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun WeightField() {
    val body = LocalBody.current
    val pack = LocalPack.current
    var text by remember { mutableStateOf("") }
    var focused by remember { mutableStateOf(false) }
    val display = body.displayWeight
    LaunchedEffect(display, focused) {
        if (!focused) text = display?.toInt()?.toString() ?: ""
    }
    fun commit() {
        val raw = text.trim()
        if (raw.isEmpty()) body.setDisplayWeight(null) else raw.toDoubleOrNull()?.let { body.setDisplayWeight(it) }
        text = body.displayWeight?.toInt()?.toString() ?: ""
    }
    Box(Modifier.width(48.dp), contentAlignment = Alignment.CenterEnd) {
        if (text.isEmpty() && !focused) {
            Text("—", fontSize = 20.sp, fontWeight = FontWeight.Black, color = PsyColors.fgMute)
        }
        BasicTextField(
            value = text,
            onValueChange = { value -> text = value.filter { it.isDigit() }.take(3) },
            singleLine = true,
            textStyle = TextStyle(fontSize = 20.sp, fontWeight = FontWeight.Black, color = PsyColors.fg, textAlign = TextAlign.End, fontFeatureSettings = "tnum"),
            cursorBrush = SolidColor(PsyColors.fg),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commit() }),
            modifier = Modifier
                .fillMaxWidth()
                .onFocusChanged { state ->
                    if (focused && !state.isFocused) commit()
                    focused = state.isFocused
                }
                .semantics { contentDescription = pack.t("body.weight") },
        )
    }
}

/** Stepper button that repeats, accelerating, while held (web body dock). */
@Composable
private fun RepeatButton(icon: String, label: String, tag: String, onStep: () -> Unit) {
    val scope = rememberCoroutineScope()
    val step by rememberUpdatedState(onStep)
    Box(
        Modifier
            .size(width = 38.dp, height = 44.dp)
            .testTag(tag)
            .semantics {
                role = Role.Button
                contentDescription = label
                onClick { step(); true }
            }
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown()
                    step()
                    var job: Job? = null
                    job = scope.launch {
                        var delayMs = 420L
                        while (true) {
                            delay(delayMs)
                            step()
                            delayMs = maxOf(40L, (delayMs * 0.8).toLong())
                        }
                    }
                    waitForUpOrCancellation()
                    job.cancel()
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        PhIcon("$icon-bold", size = 15.dp, tint = PsyColors.fg)
    }
}
