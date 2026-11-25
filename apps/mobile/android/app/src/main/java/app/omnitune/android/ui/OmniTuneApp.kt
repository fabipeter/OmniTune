package app.omnitune.android.ui

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.PlaylistAdd
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Bedtime
import androidx.compose.material.icons.rounded.Computer
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.FormatQuote
import androidx.compose.material.icons.rounded.Forward30
import androidx.compose.material.icons.rounded.Home
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.LibraryMusic
import androidx.compose.material.icons.rounded.Pause
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Repeat
import androidx.compose.material.icons.rounded.RepeatOne
import androidx.compose.material.icons.rounded.Replay10
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material.icons.rounded.SkipNext
import androidx.compose.material.icons.rounded.SkipPrevious
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.SpeakerGroup
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.omnitune.android.OmniTuneApplication
import app.omnitune.android.core.LrcLib
import app.omnitune.android.core.Lyrics
import app.omnitune.android.core.PlaybackContext
import app.omnitune.android.core.RadioEngine
import app.omnitune.android.core.RepeatMode
import app.omnitune.android.core.Track
import app.omnitune.android.core.TrackKind
import app.omnitune.android.core.formatDuration
import kotlinx.coroutines.launch

/**
 * Root Jetpack Compose shell: Unified OmniTune 4-tab bar (Home · Search · Radio · Library),
 * Midnight-Cobalt docked Now Playing bar with live progress hairline, Connect & Heart controls,
 * full-screen atmospheric Now Playing modal sheet, and OmniTune action/playlist sheets.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OmniTuneRootApp(app: OmniTuneApplication) {
    val nav = rememberNavController()
    val scope = rememberCoroutineScope()
    val snackbar = remember { SnackbarHostState() }
    val haptics = LocalHapticFeedback.current
    val playerState by app.player.state.collectAsState()
    val libState by app.library.state.collectAsState()
    val connectState by app.connect.state.collectAsState()

    var nowPlayingOpen by remember { mutableStateOf(false) }
    var devicesOpen by remember { mutableStateOf(false) }
    var actionTrack by remember { mutableStateOf<Pair<Track, String?>?>(null) }
    var playlistPickerTrack by remember { mutableStateOf<Track?>(null) }
    var createPlaylistSeed by remember { mutableStateOf<Track?>(null) }
    var showCreatePlaylist by remember { mutableStateOf(false) }

    val showToast: (String) -> Unit = { msg ->
        scope.launch {
            snackbar.currentSnackbarData?.dismiss()
            snackbar.showSnackbar(msg)
        }
    }

    val startRadio: (Track) -> Unit = { seed ->
        showToast("Starting radio from ${seed.title}…")
        scope.launch {
            val radio = RadioEngine.buildRadio(seed, app.catalog, app.library.taste(), app.library.settings().explicitFilter)
            if (radio.isNotEmpty()) {
                app.player.play(radio, 0, PlaybackContext("radio", name = "Radio · ${seed.title}"), shuffle = false)
            }
        }
    }

    val tabs = listOf(
        Triple("home", "Home", Icons.Rounded.Home),
        Triple("search", "Search", Icons.Rounded.Search),
        Triple("radio", "Radio", Icons.Rounded.Radio),
        Triple("library", "Library", Icons.Rounded.LibraryMusic),
    )

    val navBackStack by nav.currentBackStackEntryAsState()
    val currentRoute = navBackStack?.destination?.route

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            Column(modifier = Modifier.background(MaterialTheme.colorScheme.background.copy(alpha = 0.96f))) {
                AnimatedVisibility(visible = playerState.current != null) {
                    playerState.current?.let { cur ->
                        val liked = libState.likedTracks[cur.id]?.let { it.deleted != true && it.value != null } == true
                        val progress = if (playerState.durationMs > 0) {
                            (playerState.positionMs.toFloat() / playerState.durationMs.toFloat()).coerceIn(0f, 1f)
                        } else 0f
                        DockedNowPlayingBar(
                            track = cur,
                            playing = playerState.playing,
                            liked = liked,
                            progress = progress,
                            remoteDeviceName = connectState.remoteActiveDevice?.name,
                            onOpen = { nowPlayingOpen = true },
                            onOpenDevices = { devicesOpen = true },
                            onToggleLike = {
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                val now = app.library.toggleLike(cur)
                                showToast(if (now) "Added to Liked Songs" else "Removed from Liked Songs")
                            },
                            onTogglePlay = { app.player.toggle() },
                        )
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outline, thickness = 0.8.dp)
                NavigationBar(
                    containerColor = MaterialTheme.colorScheme.background.copy(alpha = 0.98f),
                    tonalElevation = 0.dp,
                ) {
                    tabs.forEach { (route, label, icon) ->
                        val selected = currentRoute == route
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                nav.navigate(route) {
                                    popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(icon, contentDescription = label) },
                            label = { Text(label, maxLines = 1, fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium) },
                            colors = NavigationBarItemDefaults.colors(
                                selectedIconColor = OmniTuneAccentSoft,
                                selectedTextColor = OmniTuneAccentSoft,
                                unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                                indicatorColor = OmniTuneAccent.copy(alpha = 0.16f),
                            ),
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = nav,
            startDestination = "home",
            modifier = Modifier.fillMaxSize().padding(padding),
        ) {
            composable("home") { HomeScreen(app, nav, showToast, onTrackMenu = { t, pid -> actionTrack = t to pid }) }
            composable("search") { SearchScreen(app, nav, showToast, onTrackMenu = { t, pid -> actionTrack = t to pid }) }
            composable("radio") { RadioScreen(app, nav, showToast) }
            composable("library") {
                LibraryScreen(
                    app = app,
                    nav = nav,
                    onCreatePlaylist = {
                        createPlaylistSeed = null
                        showCreatePlaylist = true
                    },
                )
            }
            composable("album/{id}") { back ->
                AlbumScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("artist/{id}") { back ->
                ArtistScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("podcast/{id}") { back ->
                PodcastScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("playlist/{id}") { back ->
                PlaylistScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("mix/{id}") { back ->
                MixScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("genre/{id}") { back ->
                GenreScreen(app, nav, back.arguments?.getString("id").orEmpty(), showToast) { t, pid -> actionTrack = t to pid }
            }
            composable("liked") { LikedScreen(app, nav, showToast) { t, pid -> actionTrack = t to pid } }
            composable("recent") { RecentScreen(app, nav, showToast) { t, pid -> actionTrack = t to pid } }
            composable("settings") { SettingsScreen(app, nav, showToast) }
            composable("auth") { AuthScreen(app, nav, showToast) }
        }
    }

    // Full-screen Now Playing Sheet
    if (nowPlayingOpen && playerState.current != null) {
        ModalBottomSheet(
            onDismissRequest = { nowPlayingOpen = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MaterialTheme.colorScheme.background,
            dragHandle = null,
        ) {
            NowPlayingSheetContent(
                app = app,
                onDismiss = { nowPlayingOpen = false },
                onOpenDevices = { devicesOpen = true },
                onPickPlaylist = { playlistPickerTrack = it },
                onStartRadio = startRadio,
                showToast = showToast,
            )
        }
    }

    // OmniTune Connect Devices Dialog (accessible from both Docked Bar and Now Playing Sheet)
    if (devicesOpen) {
        DevicesDialog(
            app = app,
            onDismiss = { devicesOpen = false },
            showToast = showToast,
        )
    }

    // Track Action Sheet (••• / long-press)
    actionTrack?.let { (track, playlistId) ->
        val ctx = LocalContext.current
        val liked = libState.likedTracks[track.id]?.let { it.deleted != true && it.value != null } == true
        ModalBottomSheet(
            onDismissRequest = { actionTrack = null },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { ArtworkImage(track.artworkUrl, size = 46.dp, pixelSize = 120) },
                    headlineContent = { Text(track.title, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                    supportingContent = { Text(track.artistName, maxLines = 1) },
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { Icon(Icons.AutoMirrored.Rounded.QueueMusic, null) },
                    headlineContent = { Text("Play Next") },
                    modifier = Modifier.clickable {
                        app.player.playNext(track)
                        showToast("Playing next")
                        actionTrack = null
                    },
                )
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { Icon(Icons.AutoMirrored.Rounded.PlaylistAdd, null) },
                    headlineContent = { Text("Add to Queue") },
                    modifier = Modifier.clickable {
                        app.player.addToQueue(track)
                        showToast("Added to queue")
                        actionTrack = null
                    },
                )
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { Icon(Icons.Rounded.Add, null) },
                    headlineContent = { Text("Add to Playlist") },
                    modifier = Modifier.clickable {
                        playlistPickerTrack = track
                        actionTrack = null
                    },
                )
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = {
                        Icon(
                            if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                            null,
                            tint = if (liked) OmniTuneAccent else MaterialTheme.colorScheme.onSurface,
                        )
                    },
                    headlineContent = { Text(if (liked) "Remove from Liked Songs" else "Save to Liked Songs") },
                    modifier = Modifier.clickable {
                        val now = app.library.toggleLike(track)
                        showToast(if (now) "Added to Liked Songs" else "Removed from Liked Songs")
                        actionTrack = null
                    },
                )
                if (track.kind == TrackKind.song) {
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        leadingContent = { Icon(Icons.Rounded.Radio, null) },
                        headlineContent = { Text("Start Song Radio") },
                        modifier = Modifier.clickable {
                            actionTrack = null
                            startRadio(track)
                        },
                    )
                }
                if (playlistId != null) {
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        leadingContent = { Icon(Icons.Rounded.Delete, null, tint = MaterialTheme.colorScheme.error) },
                        headlineContent = { Text("Remove from Playlist", color = MaterialTheme.colorScheme.error) },
                        modifier = Modifier.clickable {
                            app.library.removeFromPlaylist(playlistId, track.id)
                            showToast("Removed from playlist")
                            actionTrack = null
                        },
                    )
                }
                track.storeUrl?.let { url ->
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        leadingContent = { Icon(Icons.Rounded.Share, null) },
                        headlineContent = { Text("Share") },
                        modifier = Modifier.clickable {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_TEXT, "${track.title} — ${track.artistName}\n$url")
                            }
                            ctx.startActivity(Intent.createChooser(send, "Share Track"))
                            actionTrack = null
                        },
                    )
                }
            }
        }
    }

    // Playlist Picker Sheet
    playlistPickerTrack?.let { track ->
        ModalBottomSheet(
            onDismissRequest = { playlistPickerTrack = null },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(modifier = Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
                Text(
                    "Add to Playlist",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 10.dp),
                )
                ListItem(
                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                    leadingContent = { Icon(Icons.Rounded.Add, null, tint = OmniTuneAccentSoft) },
                    headlineContent = { Text("New Playlist…", color = OmniTuneAccentSoft, fontWeight = FontWeight.SemiBold) },
                    modifier = Modifier.clickable {
                        createPlaylistSeed = track
                        playlistPickerTrack = null
                        showCreatePlaylist = true
                    },
                )
                app.library.playlists().forEach { pl ->
                    ListItem(
                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                        leadingContent = { MosaicArtwork(pl.tracks.map { it.artworkUrl }, size = 44.dp) },
                        headlineContent = { Text(pl.name) },
                        supportingContent = { Text("${pl.tracks.size} songs") },
                        modifier = Modifier.clickable {
                            app.library.addToPlaylist(pl.id, listOf(track))
                            showToast("Added to ${pl.name}")
                            playlistPickerTrack = null
                        },
                    )
                }
            }
        }
    }

    // Create Playlist Dialog
    if (showCreatePlaylist) {
        var name by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showCreatePlaylist = false },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text("New Playlist", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    placeholder = { Text("Playlist name") },
                    singleLine = true,
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        val pl = app.library.createPlaylist(name, listOfNotNull(createPlaylistSeed))
                        showToast("Created ${pl.name}")
                        showCreatePlaylist = false
                    },
                    enabled = name.isNotBlank(),
                ) { Text("Create", color = OmniTuneAccentSoft, fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { showCreatePlaylist = false }) { Text("Cancel") }
            },
        )
    }
}

@Composable
private fun DockedNowPlayingBar(
    track: Track,
    playing: Boolean,
    liked: Boolean,
    progress: Float,
    remoteDeviceName: String?,
    onOpen: () -> Unit,
    onOpenDevices: () -> Unit,
    onToggleLike: () -> Unit,
    onTogglePlay: () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(10.dp),
        color = MaterialTheme.colorScheme.surfaceContainerHigh,
        border = BorderStroke(1.dp, OmniTuneAccent.copy(alpha = 0.28f)),
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 8.dp, vertical = 6.dp)
            .shadow(10.dp, RoundedCornerShape(10.dp))
            .clip(RoundedCornerShape(10.dp))
            .clickable(onClick = onOpen),
    ) {
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(start = 10.dp, end = 4.dp, top = 7.dp, bottom = 7.dp),
            ) {
                ArtworkImage(track.artworkUrl, size = 40.dp, pixelSize = 120, cornerRadius = 6.dp)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        track.title,
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (remoteDeviceName != null) {
                        Text(
                            "Listening on $remoteDeviceName",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                            color = OmniTuneAccentSoft,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    } else {
                        Text(
                            track.artistName,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
                IconButton(onClick = onOpenDevices, modifier = Modifier.size(36.dp)) {
                    Icon(
                        Icons.Rounded.Devices,
                        contentDescription = "Connect to a device",
                        tint = if (remoteDeviceName != null) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
                IconButton(onClick = onToggleLike, modifier = Modifier.size(36.dp)) {
                    Icon(
                        if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = "Like",
                        tint = if (liked) OmniTuneAccent else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(20.dp),
                    )
                }
                IconButton(onClick = onTogglePlay, modifier = Modifier.size(38.dp)) {
                    Icon(
                        if (playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                        contentDescription = if (playing) "Pause" else "Play",
                        modifier = Modifier.size(26.dp),
                    )
                }
            }
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(2.5.dp)
                    .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.10f)),
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .fillMaxWidth(progress)
                        .background(OmniTuneSonicGradient),
                )
            }
        }
    }
}

@Composable
private fun NowPlayingSheetContent(
    app: OmniTuneApplication,
    onDismiss: () -> Unit,
    onOpenDevices: () -> Unit,
    onPickPlaylist: (Track) -> Unit,
    onStartRadio: (Track) -> Unit,
    showToast: (String) -> Unit,
) {
    val st by app.player.state.collectAsState()
    val libState by app.library.state.collectAsState()
    val connectState by app.connect.state.collectAsState()
    val haptics = LocalHapticFeedback.current
    val track = st.current ?: return

    var panel by remember { mutableStateOf("art") } // art | lyrics | queue
    var lyrics by remember(track.id) { mutableStateOf<Lyrics?>(null) }
    var sleepOpen by remember { mutableStateOf(false) }
    var scrubbing by remember { mutableStateOf(false) }
    var scrubVal by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(track.id) { lyrics = LrcLib.fetchLyrics(track) }

    val liked = libState.likedTracks[track.id]?.let { it.deleted != true && it.value != null } == true
    val artScale by animateFloatAsState(if (st.playing) 1f else 0.90f, animationSpec = spring(dampingRatio = 0.75f), label = "artScale")

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        OmniTuneAccentDeep.copy(alpha = 0.58f),
                        MaterialTheme.colorScheme.background,
                        MaterialTheme.colorScheme.background,
                    ),
                ),
            ),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(horizontal = 24.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // Header
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                IconButton(onClick = onDismiss) { Icon(Icons.Rounded.KeyboardArrowDown, contentDescription = "Close") }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        st.context?.name ?: "Now Playing",
                        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                    )
                    if (track.isPreview) {
                        Text(
                            "30s PREVIEW",
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = OmniTuneAccentSoft,
                        )
                    }
                }
                IconButton(onClick = { sleepOpen = true }) {
                    Icon(
                        Icons.Rounded.Bedtime,
                        contentDescription = "Sleep Timer",
                        tint = if (st.sleepActive) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Center stage
            Box(modifier = Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                when (panel) {
                    "art" -> {
                        ArtworkImage(
                            url = track.artworkUrl,
                            size = 306.dp,
                            pixelSize = 600,
                            cornerRadius = 12.dp,
                            modifier = Modifier.scale(artScale).shadow(22.dp, RoundedCornerShape(12.dp)),
                        )
                    }
                    "lyrics" -> {
                        val synced = lyrics?.synced
                        if (!synced.isNullOrEmpty()) {
                            val active = LrcLib.activeIndex(synced, st.positionMs)
                            val listState = rememberLazyListState()
                            LaunchedEffect(active) { if (active >= 0) listState.animateScrollToItem(active) }
                            LazyColumn(state = listState, modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                itemsIndexed(synced) { idx, line ->
                                    Text(
                                        text = line.text.ifBlank { "♪" },
                                        style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                                        color = MaterialTheme.colorScheme.onBackground.copy(alpha = if (idx == active) 1f else if (idx < active) 0.52f else 0.32f),
                                        modifier = Modifier.fillMaxWidth().clickable { app.player.seek(line.timeMs) }.padding(vertical = 2.dp),
                                    )
                                }
                            }
                        } else if (!lyrics?.plain.isNullOrBlank()) {
                            LazyColumn(modifier = Modifier.fillMaxSize()) {
                                item { Text(lyrics!!.plain!!, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            }
                        } else {
                            Text("No lyrics available from LRCLIB.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    "queue" -> {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            if (st.userQueue.isNotEmpty()) {
                                item {
                                    Row(modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                                        Text("PLAYING NEXT", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                        Text("Clear", style = MaterialTheme.typography.labelMedium, color = OmniTuneAccentSoft, modifier = Modifier.clickable { app.player.clearQueue() })
                                    }
                                }
                                itemsIndexed(st.userQueue) { _, item ->
                                    ListItem(
                                        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                        leadingContent = { ArtworkImage(item.track.artworkUrl, size = 40.dp, pixelSize = 100) },
                                        headlineContent = { Text(item.track.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                        supportingContent = { Text(item.track.artistName, maxLines = 1) },
                                        modifier = Modifier.clickable { app.player.skipToQueueItem(item.uid) },
                                    )
                                }
                            }
                            item {
                                Text("UP NEXT", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
                            }
                            itemsIndexed(st.upNext.take(30)) { idx, t ->
                                ListItem(
                                    colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                                    leadingContent = { ArtworkImage(t.artworkUrl, size = 40.dp, pixelSize = 100) },
                                    headlineContent = { Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                    supportingContent = { Text(t.artistName, maxLines = 1) },
                                    modifier = Modifier.clickable { app.player.skipToUpNext(idx) },
                                )
                            }
                        }
                    }
                }
            }

            // Title + Heart + Add to playlist
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(track.title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(track.artistName, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                IconButton(onClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    val now = app.library.toggleLike(track)
                    showToast(if (now) "Added to Liked Songs" else "Removed from Liked Songs")
                }) {
                    Icon(
                        if (liked) Icons.Rounded.Favorite else Icons.Rounded.FavoriteBorder,
                        contentDescription = "Like",
                        tint = if (liked) OmniTuneAccent else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { onPickPlaylist(track) }) {
                    Icon(Icons.Rounded.Add, contentDescription = "Add to playlist")
                }
            }

            // Scrubber
            val dur = maxOf(1, st.durationMs).toFloat()
            val pos = if (scrubbing) scrubVal else st.positionMs.toFloat().coerceIn(0f, dur)
            Slider(
                value = pos,
                onValueChange = { scrubbing = true; scrubVal = it },
                onValueChangeFinished = { scrubbing = false; app.player.seek(scrubVal.toInt()) },
                valueRange = 0f..dur,
                colors = SliderDefaults.colors(
                    thumbColor = OmniTuneAccentSoft,
                    activeTrackColor = OmniTuneAccent,
                    inactiveTrackColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.18f),
                ),
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(formatDuration(pos.toInt()), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("-${formatDuration((dur - pos).toInt().coerceAtLeast(0))}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            Spacer(Modifier.height(10.dp))

            // Transport
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                if (track.kind == TrackKind.episode) {
                    TextButton(onClick = {
                        val rates = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)
                        val next = rates[(rates.indexOf(st.rate) + 1) % rates.size]
                        app.player.setRate(next)
                    }) { Text("${st.rate}×", color = OmniTuneAccentSoft, fontWeight = FontWeight.Bold) }
                } else {
                    IconButton(onClick = { app.player.toggleShuffle() }) {
                        Icon(
                            Icons.Rounded.Shuffle,
                            contentDescription = "Smart Shuffle",
                            tint = if (st.shuffle) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }

                IconButton(onClick = { if (track.kind == TrackKind.episode) app.player.seekBy(-15_000) else app.player.previous() }) {
                    Icon(if (track.kind == TrackKind.episode) Icons.Rounded.Replay10 else Icons.Rounded.SkipPrevious, contentDescription = "Previous", modifier = Modifier.size(34.dp))
                }

                Surface(
                    shape = CircleShape,
                    color = OmniTuneAccent,
                    shadowElevation = 10.dp,
                    modifier = Modifier.size(64.dp).clip(CircleShape).clickable { app.player.toggle() },
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            if (st.playing) Icons.Rounded.Pause else Icons.Rounded.PlayArrow,
                            contentDescription = "Play/Pause",
                            tint = Color.White,
                            modifier = Modifier.size(38.dp),
                        )
                    }
                }

                IconButton(onClick = { if (track.kind == TrackKind.episode) app.player.seekBy(30_000) else app.player.next() }) {
                    Icon(if (track.kind == TrackKind.episode) Icons.Rounded.Forward30 else Icons.Rounded.SkipNext, contentDescription = "Next", modifier = Modifier.size(34.dp))
                }

                IconButton(onClick = { app.player.cycleRepeat() }) {
                    Icon(
                        if (st.repeatMode == RepeatMode.one) Icons.Rounded.RepeatOne else Icons.Rounded.Repeat,
                        contentDescription = "Repeat",
                        tint = if (st.repeatMode != RepeatMode.off) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))

            // Mode toggles: Lyrics · OmniTune Connect · Song Radio · Queue
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                IconButton(onClick = { panel = if (panel == "lyrics") "art" else "lyrics" }) {
                    Icon(Icons.Rounded.FormatQuote, contentDescription = "Lyrics", tint = if (panel == "lyrics") OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = onOpenDevices) {
                    Icon(
                        Icons.Rounded.Devices,
                        contentDescription = "Connect to a device",
                        tint = if (connectState.remoteActiveDevice != null) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                IconButton(onClick = { onStartRadio(track) }) {
                    Icon(Icons.Rounded.Radio, contentDescription = "Song Radio", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                IconButton(onClick = { panel = if (panel == "queue") "art" else "queue" }) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = "Queue", tint = if (panel == "queue") OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }

    if (sleepOpen) {
        AlertDialog(
            onDismissRequest = { sleepOpen = false },
            containerColor = MaterialTheme.colorScheme.surface,
            title = { Text("Sleep Timer", fontWeight = FontWeight.Bold) },
            text = {
                Column {
                    listOf(5, 10, 15, 30, 45, 60).forEach { m ->
                        TextButton(onClick = {
                            app.player.setSleepTimer(m)
                            showToast("Sleep timer: $m min")
                            sleepOpen = false
                        }) { Text("$m minutes") }
                    }
                    TextButton(onClick = {
                        app.player.setSleepEndOfTrack()
                        showToast("Will pause after current track")
                        sleepOpen = false
                    }) { Text("End of current track") }
                    if (st.sleepActive) {
                        TextButton(onClick = {
                            app.player.setSleepTimer(null)
                            showToast("Sleep timer off")
                            sleepOpen = false
                        }) { Text("Turn off", color = MaterialTheme.colorScheme.error) }
                    }
                }
            },
            confirmButton = { TextButton(onClick = { sleepOpen = false }) { Text("Close") } },
        )
    }
}

@Composable
private fun DevicesDialog(
    app: OmniTuneApplication,
    onDismiss: () -> Unit,
    showToast: (String) -> Unit,
) {
    val connectState by app.connect.state.collectAsState()
    val scope = rememberCoroutineScope()
    var roomDraft by remember { mutableStateOf(connectState.roomCode) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Rounded.SpeakerGroup, null, tint = OmniTuneAccentSoft)
                Text("OmniTune Connect", fontWeight = FontWeight.Bold)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!connectState.connected) {
                    Text(
                        "Connect server offline. Start apps/server and configure Sync Server URL in Settings to switch playback across your devices.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    TextButton(onClick = { app.connect.reconnect() }) { Text("Retry", color = OmniTuneAccentSoft) }
                } else {
                    connectState.devices.forEach { dev ->
                        val icon = when (dev.type) {
                            "ios", "android" -> Icons.Rounded.Smartphone
                            "desktop-mac", "desktop-win" -> Icons.Rounded.Computer
                            else -> Icons.Rounded.Language
                        }
                        ListItem(
                            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                            leadingContent = { Icon(icon, null, tint = if (dev.isActive) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant) },
                            headlineContent = {
                                Text(
                                    if (dev.id == connectState.thisDeviceId) "This ${dev.name}" else dev.name,
                                    color = if (dev.isActive) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurface,
                                    fontWeight = if (dev.isActive) FontWeight.Bold else FontWeight.Normal,
                                )
                            },
                            supportingContent = { Text(if (dev.isActive) "Active device" else "Tap to switch playback") },
                            modifier = Modifier.clickable {
                                if (!dev.isActive) {
                                    scope.launch {
                                        app.connect.transferTo(dev.id, autoplay = true)
                                        showToast("Switched playback to ${dev.name}")
                                        onDismiss()
                                    }
                                }
                            },
                        )
                    }
                }
                OutlinedTextField(
                    value = roomDraft,
                    onValueChange = { roomDraft = it },
                    label = { Text("Pairing room") },
                    singleLine = true,
                )
                TextButton(onClick = {
                    app.connect.setRoomCode(roomDraft)
                    showToast("Joined room $roomDraft")
                }) { Text("Join Room", color = OmniTuneAccentSoft) }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } },
    )
}
