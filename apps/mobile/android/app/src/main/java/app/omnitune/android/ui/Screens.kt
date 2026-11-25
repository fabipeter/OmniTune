package app.omnitune.android.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.QueueMusic
import androidx.compose.material.icons.automirrored.rounded.Sort
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Favorite
import androidx.compose.material.icons.rounded.FavoriteBorder
import androidx.compose.material.icons.rounded.GraphicEq
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Shuffle
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import app.omnitune.android.OmniTuneApplication
import app.omnitune.android.core.Album
import app.omnitune.android.core.AppThemeMode
import app.omnitune.android.core.Artist
import app.omnitune.android.core.HomeShelf
import app.omnitune.android.core.Mix
import app.omnitune.android.core.OMNITUNE_GENRES
import app.omnitune.android.core.PlaybackContext
import app.omnitune.android.core.Podcast
import app.omnitune.android.core.RadioEngine
import app.omnitune.android.core.SearchResults
import app.omnitune.android.core.ShelfItem
import app.omnitune.android.core.ShuffleMode
import app.omnitune.android.core.Track
import app.omnitune.android.core.findGenre
import app.omnitune.android.core.timeGreeting
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** OmniTune track row: rounded art, active cobalt highlight, inline heart, swipe-to-queue & long-press menu. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun TrackRow(
    app: OmniTuneApplication,
    track: Track,
    playlistId: String? = null,
    showArtwork: Boolean = true,
    onPlay: () -> Unit,
    onMenu: (Track, String?) -> Unit,
    showToast: (String) -> Unit,
) {
    val libState by app.library.state.collectAsState()
    val playerState by app.player.state.collectAsState()
    val haptics = LocalHapticFeedback.current
    val liked = libState.likedTracks[track.id]?.let { it.deleted != true && it.value != null } == true
    val isCurrent = playerState.current?.id == track.id

    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.StartToEnd) {
                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                app.player.addToQueue(track)
                showToast("Added to Queue")
            }
            false
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromEndToStart = false,
        backgroundContent = {
            Box(
                modifier = Modifier.fillMaxSize().background(OmniTuneAccent).padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterStart,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.QueueMusic, contentDescription = null, tint = Color.White)
                    Text("Add to Queue", color = Color.White, fontWeight = FontWeight.Bold)
                }
            }
        },
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.background)
                .combinedClickable(onClick = onPlay, onLongClick = { onMenu(track, playlistId) })
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            if (showArtwork) {
                ArtworkImage(track.artworkUrl, size = 50.dp, pixelSize = 120, cornerRadius = 6.dp)
            } else {
                Text(
                    text = "${track.trackNumber ?: ""}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (isCurrent) OmniTuneAccentSoft else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.width(26.dp),
                )
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    track.title,
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium),
                    color = if (isCurrent) OmniTuneAccentSoft else MaterialTheme.colorScheme.onBackground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    (if (track.explicit) "E · " else "") + track.artistName,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
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
                    modifier = Modifier.size(20.dp),
                )
            }
            IconButton(onClick = { onMenu(track, playlistId) }) {
                Icon(Icons.Rounded.MoreHoriz, contentDescription = "More", tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

/** OmniTune collection action bar: Smart Shuffle pill + circular Cobalt Play FAB. */
@Composable
private fun PlayShuffleBar(onPlay: () -> Unit, onShuffle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Surface(
            shape = CircleShape,
            color = MaterialTheme.colorScheme.surfaceVariant,
            border = BorderStroke(1.dp, OmniTuneAccent.copy(alpha = 0.30f)),
            modifier = Modifier.clip(CircleShape).clickable(onClick = onShuffle),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
            ) {
                Icon(Icons.Rounded.Shuffle, null, tint = OmniTuneAccentSoft, modifier = Modifier.size(18.dp))
                Text("Smart Shuffle", fontWeight = FontWeight.Bold, style = MaterialTheme.typography.labelLarge)
            }
        }

        Surface(
            shape = CircleShape,
            color = OmniTuneAccent,
            shadowElevation = 8.dp,
            modifier = Modifier.size(52.dp).clip(CircleShape).clickable(onClick = onPlay),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.PlayArrow, contentDescription = "Play", tint = Color.White, modifier = Modifier.size(30.dp))
            }
        }
    }
}

@Composable
private fun ShelfCarousel(app: OmniTuneApplication, nav: NavController, shelf: HomeShelf) {
    val trackPool = remember(shelf) { shelf.items.filterIsInstance<ShelfItem.TrackItem>().map { it.track } }
    Column(modifier = Modifier.padding(vertical = 10.dp)) {
        Column(modifier = Modifier.padding(horizontal = 16.dp)) {
            Text(shelf.title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold))
            shelf.subtitle?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        Spacer(Modifier.height(10.dp))
        LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            items(shelf.items, key = { it.key }) { item ->
                Column(
                    modifier = Modifier.width(148.dp).clickable {
                        when (item) {
                            is ShelfItem.TrackItem -> {
                                val list = trackPool.ifEmpty { listOf(item.track) }
                                val idx = list.indexOfFirst { it.id == item.track.id }.coerceAtLeast(0)
                                app.player.play(list, idx, PlaybackContext("chart", name = shelf.title))
                            }
                            is ShelfItem.AlbumItem -> nav.navigate("album/${item.album.id}")
                            is ShelfItem.ArtistItem -> nav.navigate("artist/${item.artist.id}")
                            is ShelfItem.PodcastItem -> nav.navigate("podcast/${item.podcast.id}")
                            is ShelfItem.MixItem -> {
                                app.mixesById[item.mix.id] = item.mix
                                nav.navigate("mix/${item.mix.id}")
                            }
                            is ShelfItem.PlaylistItem -> nav.navigate("playlist/${item.playlist.id}")
                        }
                    },
                ) {
                    when (item) {
                        is ShelfItem.TrackItem -> ArtworkImage(item.track.artworkUrl, 148.dp)
                        is ShelfItem.AlbumItem -> ArtworkImage(item.album.artworkUrl, 148.dp)
                        is ShelfItem.ArtistItem -> ArtistAvatar(item.artist.id, item.artist.artworkUrl, app.catalog, 138.dp)
                        is ShelfItem.PodcastItem -> ArtworkImage(item.podcast.artworkUrl, 148.dp)
                        is ShelfItem.MixItem -> MosaicArtwork(item.mix.artwork, 148.dp)
                        is ShelfItem.PlaylistItem -> MosaicArtwork(item.playlist.tracks.map { it.artworkUrl }, 148.dp)
                    }
                    Spacer(Modifier.height(6.dp))
                    val (t, sub) = when (item) {
                        is ShelfItem.TrackItem -> item.track.title to item.track.artistName
                        is ShelfItem.AlbumItem -> item.album.title to item.album.artistName
                        is ShelfItem.ArtistItem -> item.artist.name to (item.artist.genre ?: "Artist")
                        is ShelfItem.PodcastItem -> item.podcast.title to item.podcast.author
                        is ShelfItem.MixItem -> item.mix.name to item.mix.description
                        is ShelfItem.PlaylistItem -> item.playlist.name to "${item.playlist.tracks.size} songs"
                    }
                    Text(t, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}

@Composable
private fun HeaderIconCircle(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    containerColor: Color = MaterialTheme.colorScheme.surfaceVariant,
    tint: Color = MaterialTheme.colorScheme.onSurface,
    onClick: () -> Unit,
) {
    Surface(
        shape = CircleShape,
        color = containerColor,
        modifier = Modifier.size(36.dp).clip(CircleShape).clickable(onClick = onClick),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = contentDescription, tint = tint, modifier = Modifier.size(19.dp))
        }
    }
}

@Composable
private fun QuickPickTile(
    title: String,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
    artwork: @Composable () -> Unit,
) {
    Surface(
        shape = RoundedCornerShape(6.dp),
        color = MaterialTheme.colorScheme.surfaceVariant,
        border = BorderStroke(0.8.dp, OmniTuneAccent.copy(alpha = 0.14f)),
        modifier = modifier.height(54.dp).clip(RoundedCornerShape(6.dp)).clickable(onClick = onClick),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            artwork()
            Text(
                title,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Bold),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 10.dp),
            )
        }
    }
}

// ==================== HOME ====================
@Composable
fun HomeScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val libState by app.library.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    var shelves by remember { mutableStateOf<List<HomeShelf>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }

    val playlists = remember(libState) { app.library.playlists().take(3) }
    val recentTracks = remember(libState) { app.library.recentlyPlayed(4) }

    LaunchedEffect(Unit) {
        loading = true
        val feed = RadioEngine.buildHomeFeed(app.catalog, app.library)
        shelves = feed
        feed.flatMap { it.items }.filterIsInstance<ShelfItem.MixItem>().forEach { app.mixesById[it.mix.id] = it.mix }
        loading = false
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(250.dp)
                .background(Brush.verticalGradient(listOf(OmniTuneAccent.copy(alpha = 0.24f), Color.Transparent))),
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = PaddingValues(bottom = 28.dp),
        ) {
            // Compact OmniTune Header
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    OmniTuneLogoMark(34.dp)
                    Text(
                        timeGreeting(),
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold),
                        modifier = Modifier.weight(1f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    HeaderIconCircle(Icons.Rounded.History, "Recently Played") { nav.navigate("recent") }
                    HeaderIconCircle(Icons.Rounded.Settings, "Settings") { nav.navigate("settings") }
                }
            }

            // Category Filter Chips
            item {
                Row(modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("All", "Music", "Podcasts").forEach { f ->
                        FilterChipPill(f, selected = filter == f) { filter = f }
                    }
                }
            }

            // 2-column OmniTune Quick-Pick Grid
            if (filter != "Podcasts") {
                item {
                    val quickItems = buildList<Triple<String, () -> Unit, @Composable () -> Unit>> {
                        add(
                            Triple(
                                "Liked Songs",
                                { nav.navigate("liked") },
                                {
                                    Box(modifier = Modifier.size(54.dp).background(OmniTuneSonicGradient), contentAlignment = Alignment.Center) {
                                        Icon(Icons.Rounded.Favorite, null, tint = Color.White)
                                    }
                                },
                            ),
                        )
                        add(
                            Triple(
                                "Recently Played",
                                { nav.navigate("recent") },
                                {
                                    Box(modifier = Modifier.size(54.dp).background(MaterialTheme.colorScheme.surface), contentAlignment = Alignment.Center) {
                                        Icon(Icons.Rounded.GraphicEq, null, tint = OmniTuneAccentSoft)
                                    }
                                },
                            ),
                        )
                        playlists.forEach { pl ->
                            add(
                                Triple(
                                    pl.name,
                                    { nav.navigate("playlist/${pl.id}") },
                                    { MosaicArtwork(pl.tracks.map { it.artworkUrl }, size = 54.dp, cornerRadius = 0.dp) },
                                ),
                            )
                        }
                        recentTracks.take((4 - playlists.size).coerceAtLeast(0)).forEach { track ->
                            add(
                                Triple(
                                    track.title,
                                    { app.player.playTrack(track) },
                                    { ArtworkImage(track.artworkUrl, size = 54.dp, pixelSize = 120, cornerRadius = 0.dp) },
                                ),
                            )
                        }
                    }

                    Column(
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
                    ) {
                        quickItems.chunked(2).forEach { pair ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                pair.forEach { (title, onClick, art) ->
                                    QuickPickTile(title = title, modifier = Modifier.weight(1f), onClick = onClick, artwork = art)
                                }
                                if (pair.size == 1) Spacer(Modifier.weight(1f))
                            }
                        }
                    }
                }
            }

            if (loading && shelves.isEmpty()) {
                item {
                    Box(Modifier.fillMaxWidth().height(180.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = OmniTuneAccent)
                    }
                }
            } else {
                val filtered = shelves.filter { if (filter == "All") true else if (filter == "Podcasts") it.id == "podcasts" else it.id != "podcasts" }
                items(filtered, key = { it.id }) { shelf -> ShelfCarousel(app, nav, shelf) }
            }
        }
    }
}

// ==================== SEARCH ====================
@Composable
fun SearchScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val libState by app.library.state.collectAsState()
    var query by remember { mutableStateOf("") }
    var scopeTab by remember { mutableStateOf("All") }
    var results by remember { mutableStateOf<SearchResults?>(null) }
    var releases by remember { mutableStateOf<List<Album>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }

    val recentSearches = remember(libState) { app.library.recentSearches() }

    LaunchedEffect(Unit) {
        if (releases.isEmpty()) {
            releases = runCatching { app.catalog.getNewReleases(12) }.getOrDefault(emptyList())
        }
    }

    LaunchedEffect(query) {
        val q = query.trim()
        if (q.isEmpty()) {
            results = null
            return@LaunchedEffect
        }
        loading = true
        delay(250)
        results = runCatching { app.catalog.search(q, 20) }.getOrNull()
        app.library.addRecentSearch(q)
        loading = false
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding(),
        contentPadding = PaddingValues(bottom = 28.dp),
    ) {
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                OmniTuneLogoMark(30.dp)
                Text("Search", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
            }
        }
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("What do you want to play?") },
                leadingIcon = { Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Clear")
                        }
                    }
                },
                singleLine = true,
                shape = CircleShape,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
                    focusedBorderColor = OmniTuneAccent,
                    unfocusedBorderColor = OmniTuneAccent.copy(alpha = 0.25f),
                ),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        if (query.isBlank()) {
            if (recentSearches.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text("Recent Searches", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                        TextButton(onClick = { app.library.clearRecentSearches() }) {
                            Text("Clear", color = OmniTuneAccentSoft)
                        }
                    }
                    LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        items(recentSearches) { term ->
                            FilterChipPill(term, selected = false) { query = term }
                        }
                    }
                }
            }
            if (releases.isNotEmpty()) {
                item {
                    ShelfCarousel(app, nav, HomeShelf("s-new", "New & Trending Releases", items = releases.map { ShelfItem.AlbumItem(it) }))
                }
            }
            item {
                Text(
                    "Browse All",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
            items(OMNITUNE_GENRES.chunked(2)) { pair ->
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { g ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(88.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Brush.linearGradient(listOf(Color(g.colorHex), OmniTuneSurface)))
                                .clickable { nav.navigate("genre/${g.id}") }
                                .padding(14.dp),
                            contentAlignment = Alignment.TopStart,
                        ) {
                            Text(g.name, color = Color.White, fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
                        }
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        } else {
            item {
                LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(listOf("All", "Songs", "Albums", "Artists", "Podcasts")) { tab ->
                        FilterChipPill(tab, selected = scopeTab == tab) { scopeTab = tab }
                    }
                }
            }
            if (loading) {
                item { Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = OmniTuneAccent) } }
            } else results?.let { res ->
                if ((scopeTab == "All" || scopeTab == "Songs") && res.songs.isNotEmpty()) {
                    itemsIndexed(res.songs.take(if (scopeTab == "All") 6 else 25)) { idx, t ->
                        TrackRow(app, t, onPlay = { app.player.play(res.songs, idx, PlaybackContext("search", name = "Search: $query")) }, onMenu = onTrackMenu, showToast = showToast)
                    }
                }
                if ((scopeTab == "All" || scopeTab == "Artists") && res.artists.isNotEmpty()) {
                    item { ShelfCarousel(app, nav, HomeShelf("sa", "Artists", items = res.artists.map { ShelfItem.ArtistItem(it) })) }
                }
                if ((scopeTab == "All" || scopeTab == "Albums") && res.albums.isNotEmpty()) {
                    item { ShelfCarousel(app, nav, HomeShelf("sal", "Albums", items = res.albums.map { ShelfItem.AlbumItem(it) })) }
                }
                if ((scopeTab == "All" || scopeTab == "Podcasts") && res.podcasts.isNotEmpty()) {
                    item { ShelfCarousel(app, nav, HomeShelf("sp", "Podcasts", items = res.podcasts.map { ShelfItem.PodcastItem(it) })) }
                }
            }
        }
    }
}

// ==================== RADIO ====================
@Composable
fun RadioScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    val libState by app.library.state.collectAsState()
    var mixes by remember { mutableStateOf<List<Mix>>(emptyList()) }
    var podcasts by remember { mutableStateOf<List<Podcast>>(emptyList()) }
    val topArtists = remember(libState) { app.library.taste().topArtists(4) }

    LaunchedEffect(Unit) {
        mixes = RadioEngine.buildMixes(app.catalog, app.library.taste(), app.library.recentlyPlayed(25), app.library.settings().explicitFilter)
        mixes.forEach { app.mixesById[it.id] = it }
        podcasts = runCatching { app.catalog.getTopPodcasts(12) }.getOrDefault(emptyList())
    }

    Box(modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(220.dp)
                .background(Brush.verticalGradient(listOf(OmniTuneAccent.copy(alpha = 0.22f), Color.Transparent))),
        )
        LazyColumn(
            modifier = Modifier.fillMaxSize().statusBarsPadding(),
            contentPadding = PaddingValues(bottom = 28.dp),
        ) {
            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                ) {
                    OmniTuneLogoMark(30.dp)
                    Column {
                        Text("OmniTune Radio", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
                        Text("Smart Shuffle stations & personal mixes", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            if (mixes.isNotEmpty()) {
                item {
                    ShelfCarousel(app, nav, HomeShelf("r-mix", "Made for You", "Endless mixes shaped by your plays, likes and skips", mixes.map { ShelfItem.MixItem(it) }))
                }
            }
            item {
                Text(
                    "Sonic Stations",
                    style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold),
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 10.dp),
                )
            }
            if (topArtists.isNotEmpty()) {
                items(topArtists.chunked(2)) { pair ->
                    Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        pair.forEach { artistName ->
                            val title = artistName.replaceFirstChar { it.uppercase() }
                            StationTile(
                                title = title,
                                subtitle = "Artist Radio",
                                accent = OmniTuneAccent,
                                modifier = Modifier.weight(1f),
                                onClick = {
                                    showToast("Tuning $title Station…")
                                    scope.launch {
                                        val songs = runCatching { app.catalog.search(artistName, 35).songs }.getOrDefault(emptyList())
                                        if (songs.isNotEmpty()) app.player.play(songs, context = PlaybackContext("radio", name = "$title Station"), shuffle = true)
                                    }
                                },
                            )
                        }
                        if (pair.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
            items(OMNITUNE_GENRES.take(8).chunked(2)) { pair ->
                Row(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    pair.forEach { g ->
                        StationTile(
                            title = "${g.name} Radio",
                            subtitle = "Smart Shuffle",
                            accent = Color(g.colorHex),
                            modifier = Modifier.weight(1f),
                            onClick = {
                                showToast("Tuning ${g.name} Radio…")
                                scope.launch {
                                    val songs = runCatching { app.catalog.getGenreTracks(g, 35) }.getOrDefault(emptyList())
                                    if (songs.isNotEmpty()) app.player.play(songs, context = PlaybackContext("radio", name = "${g.name} Radio"), shuffle = true)
                                }
                            },
                        )
                    }
                    if (pair.size == 1) Spacer(Modifier.weight(1f))
                }
            }
            if (podcasts.isNotEmpty()) {
                item {
                    ShelfCarousel(app, nav, HomeShelf("r-pod", "Featured Shows", items = podcasts.map { ShelfItem.PodcastItem(it) }))
                }
            }
        }
    }
}

@Composable
private fun StationTile(title: String, subtitle: String, accent: Color, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Box(
        modifier = modifier
            .height(98.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(Brush.linearGradient(listOf(accent, OmniTuneSurface)))
            .clickable(onClick = onClick)
            .padding(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxSize()) {
            Icon(Icons.Rounded.Radio, null, tint = Color.White.copy(alpha = 0.90f), modifier = Modifier.size(20.dp))
            Column {
                Text(title, color = Color.White, fontWeight = FontWeight.ExtraBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle, color = Color.White.copy(alpha = 0.80f), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

// ==================== LIBRARY ====================
@Composable
fun LibraryScreen(app: OmniTuneApplication, nav: NavController, onCreatePlaylist: () -> Unit) {
    val libState by app.library.state.collectAsState()
    var filter by remember { mutableStateOf("All") }
    var sortAlpha by remember { mutableStateOf(false) }

    val playlists = remember(libState, sortAlpha) {
        val list = app.library.playlists()
        if (sortAlpha) list.sortedBy { it.name.lowercase() } else list
    }
    val albums = remember(libState, sortAlpha) {
        val list = app.library.savedAlbums()
        if (sortAlpha) list.sortedBy { it.title.lowercase() } else list
    }
    val artists = remember(libState, sortAlpha) {
        val list = app.library.followedArtists()
        if (sortAlpha) list.sortedBy { it.name.lowercase() } else list
    }
    val podcasts = remember(libState, sortAlpha) {
        val list = app.library.followedPodcasts()
        if (sortAlpha) list.sortedBy { it.title.lowercase() } else list
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).statusBarsPadding(),
        contentPadding = PaddingValues(bottom = 28.dp),
    ) {
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            ) {
                OmniTuneLogoMark(30.dp)
                Text("Your Library", style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold), modifier = Modifier.weight(1f))
                HeaderIconCircle(Icons.AutoMirrored.Rounded.Sort, "Sort") { sortAlpha = !sortAlpha }
                HeaderIconCircle(Icons.Rounded.Add, "New Playlist", containerColor = OmniTuneAccent, tint = Color.White, onClick = onCreatePlaylist)
                HeaderIconCircle(Icons.Rounded.Settings, "Settings") { nav.navigate("settings") }
            }
        }
        item {
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(listOf("All", "Playlists", "Albums", "Artists", "Podcasts")) { f ->
                    FilterChipPill(f, selected = filter == f) { filter = f }
                }
            }
        }
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable { nav.navigate("liked") }.padding(horizontal = 16.dp, vertical = 9.dp),
            ) {
                Box(
                    modifier = Modifier.size(54.dp).clip(RoundedCornerShape(8.dp)).background(OmniTuneSonicGradient),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.Favorite, null, tint = Color.White) }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Liked Songs", fontWeight = FontWeight.Bold)
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Rounded.PushPin, null, tint = OmniTuneAccentSoft, modifier = Modifier.size(13.dp))
                        Text("Playlist · ${app.library.likedTracks().size} songs", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth().clickable { nav.navigate("recent") }.padding(horizontal = 16.dp, vertical = 9.dp),
            ) {
                Box(
                    modifier = Modifier.size(54.dp).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Rounded.History, null, tint = OmniTuneAccentSoft) }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("Recently Played", fontWeight = FontWeight.Bold)
                    Text("${app.library.recentlyPlayed(50).size} tracks", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (filter == "All" || filter == "Playlists") {
            items(playlists, key = { it.id }) { pl ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { nav.navigate("playlist/${pl.id}") }.padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    MosaicArtwork(pl.tracks.map { it.artworkUrl }, 54.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(pl.name, fontWeight = FontWeight.SemiBold)
                        Text("Playlist · ${pl.tracks.size} songs", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (filter == "All" || filter == "Albums") {
            items(albums, key = { "alb-${it.id}" }) { a ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { nav.navigate("album/${a.id}") }.padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    ArtworkImage(a.artworkUrl, 54.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(a.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Album · ${a.artistName}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
        }
        if (filter == "All" || filter == "Artists") {
            items(artists, key = { "art-${it.id}" }) { a ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { nav.navigate("artist/${a.id}") }.padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    ArtistAvatar(a.id, a.artworkUrl, app.catalog, 52.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(a.name, fontWeight = FontWeight.SemiBold)
                        Text("Artist", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        if (filter == "All" || filter == "Podcasts") {
            items(podcasts, key = { "pod-${it.id}" }) { p ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clickable { nav.navigate("podcast/${p.id}") }.padding(horizontal = 16.dp, vertical = 8.dp),
                ) {
                    ArtworkImage(p.artworkUrl, 54.dp)
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text(p.title, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("Podcast · ${p.author}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                    }
                }
            }
        }
    }
}

// ==================== DETAIL SCREENS ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun detailTopBarColors() = TopAppBarDefaults.topAppBarColors(
    containerColor = MaterialTheme.colorScheme.background,
    titleContentColor = MaterialTheme.colorScheme.onBackground,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlbumScreen(app: OmniTuneApplication, nav: NavController, albumId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    var data by remember { mutableStateOf<Pair<Album, List<Track>>?>(null) }
    val libState by app.library.state.collectAsState()
    LaunchedEffect(albumId) { data = runCatching { app.catalog.getAlbum(albumId) }.getOrNull() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(data?.first?.title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        val (album, tracks) = data ?: return@Scaffold Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = OmniTuneAccent) }
        val saved = libState.savedAlbums[album.id]?.let { it.deleted != true && it.value != null } == true
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brush.verticalGradient(listOf(OmniTuneAccent.copy(alpha = 0.24f), Color.Transparent)))
                        .padding(16.dp),
                ) {
                    ArtworkImage(album.artworkUrl, 220.dp, pixelSize = 600, cornerRadius = 10.dp)
                    Spacer(Modifier.height(12.dp))
                    Text(album.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
                    Text(album.artistName, color = OmniTuneAccentSoft, fontWeight = FontWeight.SemiBold, modifier = Modifier.clickable { album.artistId?.let { nav.navigate("artist/$it") } })
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(onClick = { app.library.toggleAlbum(album); showToast(if (saved) "Removed" else "Saved Album") }) { Text(if (saved) "Saved" else "Save Album") }
                    PlayShuffleBar(
                        onPlay = { app.player.play(tracks, context = PlaybackContext("album", album.id, album.title), shuffle = false) },
                        onShuffle = { app.player.play(tracks, context = PlaybackContext("album", album.id, album.title), shuffle = true) },
                    )
                }
            }
            itemsIndexed(tracks) { idx, t ->
                TrackRow(app, t, showArtwork = false, onPlay = { app.player.play(tracks, idx, PlaybackContext("album", album.id, album.title), shuffle = false) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtistScreen(app: OmniTuneApplication, nav: NavController, artistId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    var data by remember { mutableStateOf<Triple<Artist, List<Track>, List<Album>>?>(null) }
    val libState by app.library.state.collectAsState()
    LaunchedEffect(artistId) { data = runCatching { app.catalog.getArtist(artistId) }.getOrNull() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(data?.first?.name.orEmpty()) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        val (artist, topSongs, albums) = data ?: return@Scaffold Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = OmniTuneAccent) }
        val followed = libState.followedArtists[artist.id]?.let { it.deleted != true && it.value != null } == true
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            item {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Brush.verticalGradient(listOf(OmniTuneAccent.copy(alpha = 0.24f), Color.Transparent)))
                        .padding(16.dp),
                ) {
                    ArtworkImage(artist.artworkUrl, 160.dp, pixelSize = 500, circle = true)
                    Spacer(Modifier.height(10.dp))
                    Text(artist.name, style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold))
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { app.library.toggleArtist(artist); showToast(if (followed) "Unfollowed" else "Following ${artist.name}") },
                        colors = ButtonDefaults.buttonColors(containerColor = if (followed) MaterialTheme.colorScheme.surfaceVariant else OmniTuneAccent),
                        shape = CircleShape,
                    ) {
                        Text(if (followed) "Following" else "Follow", color = Color.White)
                    }
                    PlayShuffleBar(
                        onPlay = { app.player.play(topSongs, context = PlaybackContext("artist", artist.id, artist.name), shuffle = false) },
                        onShuffle = { app.player.play(topSongs, context = PlaybackContext("artist", artist.id, artist.name), shuffle = true) },
                    )
                }
            }
            itemsIndexed(topSongs.take(10)) { idx, t ->
                TrackRow(app, t, onPlay = { app.player.play(topSongs, idx, PlaybackContext("artist", artist.id, artist.name)) }, onMenu = onTrackMenu, showToast = showToast)
            }
            if (albums.isNotEmpty()) {
                item { ShelfCarousel(app, nav, HomeShelf("art-alb", "Discography", items = albums.map { ShelfItem.AlbumItem(it) })) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PodcastScreen(app: OmniTuneApplication, nav: NavController, podcastId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    var data by remember { mutableStateOf<Pair<Podcast, List<Track>>?>(null) }
    LaunchedEffect(podcastId) { data = runCatching { app.catalog.getPodcast(podcastId) }.getOrNull() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(data?.first?.title.orEmpty(), maxLines = 1) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        val (pod, eps) = data ?: return@Scaffold Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = OmniTuneAccent) }
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    ArtworkImage(pod.artworkUrl, 190.dp, pixelSize = 500)
                    Spacer(Modifier.height(10.dp))
                    Text(pod.title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.ExtraBold))
                    Text(pod.author, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            itemsIndexed(eps) { idx, ep ->
                TrackRow(app, ep, onPlay = { app.player.play(eps, idx, PlaybackContext("podcast", pod.id, pod.title), shuffle = false) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaylistScreen(app: OmniTuneApplication, nav: NavController, playlistId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val libState by app.library.state.collectAsState()
    val pl = remember(libState, playlistId) { app.library.playlist(playlistId) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(pl?.name ?: "Playlist") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
                actions = {
                    if (pl != null) {
                        IconButton(onClick = { app.library.deletePlaylist(pl.id); nav.popBackStack() }) { Icon(Icons.Rounded.Delete, "Delete") }
                    }
                },
            )
        },
    ) { pad ->
        if (pl == null) return@Scaffold
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    MosaicArtwork(pl.tracks.map { it.artworkUrl }, 200.dp, 10.dp)
                    Spacer(Modifier.height(10.dp))
                    Text(pl.name, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
                    Text("${pl.tracks.size} songs", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    if (pl.tracks.isNotEmpty()) {
                        PlayShuffleBar(
                            onPlay = { app.player.play(pl.tracks, context = PlaybackContext("playlist", pl.id, pl.name), shuffle = false) },
                            onShuffle = { app.player.play(pl.tracks, context = PlaybackContext("playlist", pl.id, pl.name), shuffle = true) },
                        )
                    }
                }
            }
            itemsIndexed(pl.tracks) { idx, t ->
                TrackRow(app, t, playlistId = pl.id, onPlay = { app.player.play(pl.tracks, idx, PlaybackContext("playlist", pl.id, pl.name), shuffle = false) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MixScreen(app: OmniTuneApplication, nav: NavController, mixId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val mix = app.mixesById[mixId]
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(mix?.name ?: "Mix") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        if (mix == null) return@Scaffold
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                    MosaicArtwork(mix.artwork, 200.dp, 10.dp)
                    Spacer(Modifier.height(10.dp))
                    Text(mix.name, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
                    Text(mix.description, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    PlayShuffleBar(
                        onPlay = { app.player.play(mix.tracks, context = PlaybackContext("mix", mix.id, mix.name), shuffle = false) },
                        onShuffle = { app.player.play(mix.tracks, context = PlaybackContext("mix", mix.id, mix.name), shuffle = true) },
                    )
                }
            }
            itemsIndexed(mix.tracks) { idx, t ->
                TrackRow(app, t, onPlay = { app.player.play(mix.tracks, idx, PlaybackContext("mix", mix.id, mix.name), shuffle = false) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GenreScreen(app: OmniTuneApplication, nav: NavController, genreId: String, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val genre = findGenre(genreId)
    var tracks by remember { mutableStateOf<List<Track>>(emptyList()) }
    LaunchedEffect(genreId) { if (genre != null) tracks = runCatching { app.catalog.getGenreTracks(genre, 40) }.getOrDefault(emptyList()) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(genre?.name ?: "Genre") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            if (tracks.isNotEmpty() && genre != null) {
                item {
                    PlayShuffleBar(
                        onPlay = { app.player.play(tracks, context = PlaybackContext("genre", genre.id, genre.name), shuffle = false) },
                        onShuffle = { app.player.play(tracks, context = PlaybackContext("genre", genre.id, genre.name), shuffle = true) },
                    )
                }
                itemsIndexed(tracks) { idx, t ->
                    TrackRow(app, t, onPlay = { app.player.play(tracks, idx, PlaybackContext("genre", genre.id, genre.name)) }, onMenu = onTrackMenu, showToast = showToast)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LikedScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val libState by app.library.state.collectAsState()
    val tracks = remember(libState) { app.library.likedTracks() }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text("Liked Songs") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            if (tracks.isNotEmpty()) {
                item {
                    PlayShuffleBar(
                        onPlay = { app.player.play(tracks, context = PlaybackContext("liked", name = "Liked Songs"), shuffle = false) },
                        onShuffle = { app.player.play(tracks, context = PlaybackContext("liked", name = "Liked Songs"), shuffle = true) },
                    )
                }
            }
            itemsIndexed(tracks) { idx, t ->
                TrackRow(app, t, onPlay = { app.player.play(tracks, idx, PlaybackContext("liked", name = "Liked Songs"), shuffle = false) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecentScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit, onTrackMenu: (Track, String?) -> Unit) {
    val libState by app.library.state.collectAsState()
    val tracks = remember(libState) { app.library.recentlyPlayed(50) }
    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text("Recently Played") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad)) {
            itemsIndexed(tracks) { idx, t ->
                TrackRow(app, t, onPlay = { app.player.play(tracks, idx, PlaybackContext("recent", name = "Recently Played")) }, onMenu = onTrackMenu, showToast = showToast)
            }
        }
    }
}

// ==================== SETTINGS & AUTH ====================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit) {
    val libState by app.library.state.collectAsState()
    val user by app.library.user.collectAsState()
    val scope = rememberCoroutineScope()
    val s = remember(libState) { app.library.settings() }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text("Settings", fontWeight = FontWeight.Bold) },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item {
                Text("Account & Sync", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Spacer(Modifier.height(6.dp))
                if (user != null) {
                    Text("${user!!.displayName} (${user!!.email})")
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(onClick = {
                            scope.launch {
                                runCatching { app.library.syncNow() }
                                    .onSuccess { showToast("Synced ($it updates)") }
                                    .onFailure { showToast(it.message ?: "Sync failed") }
                            }
                        }) { Text("Sync Now") }
                        OutlinedButton(onClick = { app.library.logout(); showToast("Signed out") }) { Text("Sign Out") }
                    }
                } else {
                    Button(onClick = { nav.navigate("auth") }, colors = ButtonDefaults.buttonColors(containerColor = OmniTuneAccent)) {
                        Text("Sign In / Create Account")
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = s.serverUrl,
                    onValueChange = { url -> app.library.updateSettings { it.copy(serverUrl = url) } },
                    label = { Text("Sync Server URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Text("Playback & Shuffle", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("OmniTune Smart Shuffle")
                    Switch(
                        checked = s.shuffleMode == ShuffleMode.smart,
                        onCheckedChange = { on -> app.library.updateSettings { it.copy(shuffleMode = if (on) ShuffleMode.smart else ShuffleMode.random) } },
                        colors = SwitchDefaults.colors(checkedTrackColor = OmniTuneAccent),
                    )
                }
                Text("Crossfade: ${s.crossfadeMs / 1000}s")
                Slider(
                    value = (s.crossfadeMs / 1000).toFloat(),
                    onValueChange = { v -> app.library.updateSettings { it.copy(crossfadeMs = v.toInt() * 1000) } },
                    valueRange = 0f..12f,
                    steps = 11,
                    colors = SliderDefaults.colors(thumbColor = OmniTuneAccentSoft, activeTrackColor = OmniTuneAccent),
                )
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Autoplay Radio")
                    Switch(
                        checked = s.autoplay,
                        onCheckedChange = { v -> app.library.updateSettings { it.copy(autoplay = v) } },
                        colors = SwitchDefaults.colors(checkedTrackColor = OmniTuneAccent),
                    )
                }
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Hide Explicit Content")
                    Switch(
                        checked = s.explicitFilter,
                        onCheckedChange = { v -> app.library.updateSettings { it.copy(explicitFilter = v) } },
                        colors = SwitchDefaults.colors(checkedTrackColor = OmniTuneAccent),
                    )
                }
            }
            item {
                Text("Appearance", style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    AppThemeMode.entries.forEach { mode ->
                        FilterChipPill(mode.name.replaceFirstChar { it.uppercase() }, selected = s.theme == mode) {
                            app.library.updateSettings { it.copy(theme = mode) }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                OutlinedButton(onClick = { app.library.clearHistory(); showToast("Listening history cleared") }) {
                    Text("Clear Listening History", color = MaterialTheme.colorScheme.error)
                }
            }
            item {
                Text(
                    "Streaming note: Songs stream 30-second AAC catalog previews via Media3 ExoPlayer (podcasts always play full-length).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuthScreen(app: OmniTuneApplication, nav: NavController, showToast: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var register by remember { mutableStateOf(false) }
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var err by remember { mutableStateOf<String?>(null) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                colors = detailTopBarColors(),
                title = { Text(if (register) "Create Account" else "Sign In") },
                navigationIcon = { IconButton(onClick = { nav.popBackStack() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { pad ->
        Column(modifier = Modifier.fillMaxSize().padding(pad).padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (register) {
                OutlinedTextField(value = displayName, onValueChange = { displayName = it }, label = { Text("Display name") }, modifier = Modifier.fillMaxWidth())
            }
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Password (8+ chars)") },
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            err?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Button(
                onClick = {
                    err = null
                    scope.launch {
                        runCatching {
                            if (register) app.library.register(email, password, displayName)
                            else app.library.login(email, password)
                        }.onSuccess {
                            showToast("Signed in!")
                            nav.popBackStack()
                        }.onFailure { err = it.message }
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = OmniTuneAccent),
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (register) "Create Account" else "Sign In") }
            TextButton(onClick = { register = !register; err = null }) {
                Text(if (register) "Already have an account? Sign In" else "Need an account? Create one")
            }
        }
    }
}
