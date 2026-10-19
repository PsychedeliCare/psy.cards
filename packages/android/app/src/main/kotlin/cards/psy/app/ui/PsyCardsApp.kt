package cards.psy.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import cards.psy.app.R
import cards.psy.app.ui.card.BodyDock
import cards.psy.app.ui.combos.CombosScreen
import cards.psy.app.ui.list.SubstanceListScreen
import cards.psy.app.ui.settings.SettingsScreen
import cards.psy.app.ui.substance.SubstanceCardContent
import cards.psy.app.ui.theme.PsyColors
import cards.psy.app.ui.wheel.WheelScreen

sealed interface Route
data object SubstancesRoute : Route
data object CombosRoute : Route
data object SettingsRoute : Route
data class SubstanceRoute(val key: String) : Route

enum class BrowseMode { list, wheel }

/** One back stack per tab; switching tabs keeps each tab's history (Nav3 recipe). */
class TopLevelBackStack(start: Route) {
    private val stacks = linkedMapOf<Route, SnapshotStateList<Route>>(start to mutableStateListOf(start))
    var topLevel by mutableStateOf(start)
        private set
    val backStack = mutableStateListOf(start)

    private fun sync() {
        backStack.clear()
        stacks.values.forEach { backStack.addAll(it) }
    }

    fun select(route: Route) {
        if (route == topLevel) {
            stacks[route]?.let { stack -> while (stack.size > 1) stack.removeAt(stack.lastIndex) }
        } else {
            stacks.remove(route)?.let { stacks[route] = it } ?: run { stacks[route] = mutableStateListOf(route) }
        }
        topLevel = route
        sync()
    }

    fun push(route: Route) {
        stacks.getValue(topLevel).add(route)
        sync()
    }

    fun pop() {
        val stack = stacks.getValue(topLevel)
        if (stack.size > 1) {
            stack.removeAt(stack.lastIndex)
        } else if (stacks.size > 1) {
            stacks.remove(topLevel)
            topLevel = stacks.keys.last()
        }
        sync()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PsyCardsApp(
    navigation: TopLevelBackStack,
    browseMode: BrowseMode,
    onBrowseMode: (BrowseMode) -> Unit,
    selectedKey: String?,
    onSelectedKey: (String) -> Unit,
) {
    val pack = LocalPack.current
    val tabs = listOf(
        Triple(SubstancesRoute, "landing.navList", R.drawable.ph_cards_fill),
        Triple(CombosRoute, "landing.navCombos", R.drawable.ph_grid_nine_fill),
        Triple(SettingsRoute, "categoryNav.settings", R.drawable.ph_gear_six_fill),
    )

    NavigationSuiteScaffold(
        navigationSuiteItems = {
            tabs.forEach { (route, label, icon) ->
                item(
                    selected = navigation.topLevel == route,
                    onClick = { navigation.select(route) },
                    icon = { Icon(painterResource(icon), null, Modifier.size(22.dp)) },
                    label = { Text(pack.t(label)) },
                    modifier = Modifier.testTag("tab-${label.substringAfterLast('.')}"),
                )
            }
        },
        containerColor = PsyColors.ink,
    ) {
        NavDisplay(
            backStack = navigation.backStack,
            onBack = { navigation.pop() },
            entryProvider = entryProvider {
                entry<SubstancesRoute> {
                    SubstancesHome(browseMode, onBrowseMode, selectedKey, onSelectedKey) { navigation.push(SubstanceRoute(it)) }
                }
                entry<SubstanceRoute> { route -> SubstanceDetailScreen(route.key, onBack = { navigation.pop() }) { navigation.push(SubstanceRoute(it)) } }
                entry<CombosRoute> {
                    Box(Modifier.fillMaxSize().padding(WindowInsets.statusBars.asPaddingValues())) {
                        CombosScreen(onOpenSubstance = { navigation.push(SubstanceRoute(it)) })
                    }
                }
                entry<SettingsRoute> { SettingsScreen(WindowInsets.statusBars.asPaddingValues()) }
            },
        )
    }
}

/** Substances tab: list or wheel, list-detail side by side on wide screens. */
@Composable
private fun SubstancesHome(
    browseMode: BrowseMode,
    onBrowseMode: (BrowseMode) -> Unit,
    selectedKey: String?,
    onSelectedKey: (String) -> Unit,
    onPush: (String) -> Unit,
) {
    val pack = LocalPack.current
    val top = WindowInsets.statusBars.asPaddingValues()
    val header: @Composable () -> Unit = { HomeHeader(browseMode, onBrowseMode) }
    WithBodyDock(showDock = browseMode == BrowseMode.wheel) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            when {
                browseMode == BrowseMode.wheel -> WheelScreen(
                    selectedKey = selectedKey ?: pack.substances.firstOrNull()?.key,
                    onSelect = onSelectedKey,
                    onOpenSubstance = onPush,
                    header = header,
                    contentPadding = PaddingValues(top = top.calculateTopPadding(), bottom = 110.dp),
                )
                maxWidth >= 840.dp -> Row(Modifier.fillMaxSize()) {
                    SubstanceListScreen(
                        selectedKey = selectedKey,
                        onOpen = onSelectedKey,
                        header = header,
                        contentPadding = PaddingValues(top = top.calculateTopPadding(), bottom = 24.dp),
                        modifier = Modifier.weight(0.4f),
                    )
                    val key = selectedKey ?: pack.substances.firstOrNull()?.key
                    WithBodyDock(showDock = true, modifier = Modifier.weight(0.6f)) {
                        key?.let { pack.substance(it) }?.let { substance ->
                            Box(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(top = top.calculateTopPadding()).padding(16.dp).padding(bottom = 96.dp)) {
                                SubstanceCardContent(substance, onPush)
                            }
                        }
                    }
                }
                else -> SubstanceListScreen(
                    selectedKey = selectedKey,
                    onOpen = { onSelectedKey(it); onPush(it) },
                    header = header,
                    contentPadding = PaddingValues(top = top.calculateTopPadding(), bottom = 24.dp),
                )
            }
        }
    }
}

@Composable
private fun HomeHeader(browseMode: BrowseMode, onBrowseMode: (BrowseMode) -> Unit) {
    val pack = LocalPack.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Image(painterResource(R.drawable.logo), null, Modifier.size(26.dp).clip(RoundedCornerShape(6.dp)))
        Text("psy.cards", fontSize = 18.sp, fontWeight = FontWeight.Black)
        Spacer(Modifier.weight(1f))
        SingleChoiceSegmentedButtonRow {
            BrowseMode.entries.forEachIndexed { index, mode ->
                SegmentedButton(
                    selected = browseMode == mode,
                    onClick = { onBrowseMode(mode) },
                    shape = SegmentedButtonDefaults.itemShape(index, 2),
                    icon = {},
                    colors = SegmentedButtonDefaults.colors(activeContainerColor = PsyColors.fg, activeContentColor = PsyColors.ink),
                    modifier = Modifier.testTag("browse-${mode.name}"),
                ) { Text(pack.t(if (mode == BrowseMode.list) "landing.viewList" else "landing.viewWheel"), fontWeight = FontWeight.SemiBold) }
            }
        }
    }
}

/** A substance's own page: top bar, card + details, floating body dock. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubstanceDetailScreen(key: String, onBack: () -> Unit, onOpenSubstance: (String) -> Unit) {
    val pack = LocalPack.current
    val substance = pack.substance(key) ?: return
    val hue = PsyColors.group(substance.group)
    WithBodyDock(showDock = true) {
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(hue.copy(alpha = 0.14f), PsyColors.ink), endY = 1600f))) {
            val scroll = rememberScrollState()
            Box(
                Modifier
                    .fillMaxSize()
                    .verticalScroll(scroll)
                    .padding(WindowInsets.statusBars.asPaddingValues())
                    .padding(top = 64.dp, start = 16.dp, end = 16.dp, bottom = 110.dp),
            ) {
                SubstanceCardContent(substance, onOpenSubstance)
            }
            TopAppBar(
                title = { Text(substance.prettyName, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.testTag("back")) {
                        Icon(painterResource(R.drawable.ph_caret_left_bold), pack.t("layout.close"), Modifier.size(20.dp))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = if (scroll.value > 0) PsyColors.ink.copy(alpha = 0.97f) else PsyColors.ink.copy(alpha = 0f),
                ),
            )
        }
    }
}

@Composable
private fun WithBodyDock(showDock: Boolean, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(modifier.fillMaxSize()) {
        content()
        if (showDock) BodyDock(Modifier.align(Alignment.BottomCenter).navigationBarsPadding())
    }
}
