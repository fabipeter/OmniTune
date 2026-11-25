package app.omnitune.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.MusicNote
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.omnitune.android.core.CatalogProvider
import app.omnitune.android.core.artworkAt
import coil3.compose.AsyncImage

/** OmniTune electric cobalt accent (`#1E63FF`) harmonized with the logo on Midnight Navy. */
val OmniTuneAccent = Color(0xFF1E63FF)
val OmniTuneAccentSoft = Color(0xFF3B7BFF)
val OmniTuneSonicGradient = Brush.linearGradient(listOf(Color(0xFF0A3899), Color(0xFF1E63FF), Color(0xFF38BDF8)))

private val DarkScheme = darkColorScheme(
    primary = OmniTuneAccent,
    onPrimary = Color.White,
    background = Color(0xFF070D1B),
    surface = Color(0xFF0D162B),
    surfaceVariant = Color(0xFF13203C),
    onBackground = Color(0xFFF4F7FF),
    onSurface = Color(0xFFF4F7FF),
    onSurfaceVariant = Color(0xFF9AA9C7),
)

private val LightScheme = lightColorScheme(
    primary = Color(0xFF0E46AD),
    onPrimary = Color.White,
    background = Color(0xFFEDF2FA),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFE6EEF9),
    onBackground = Color(0xFF0A1224),
    onSurface = Color(0xFF0A1224),
    onSurfaceVariant = Color(0xFF4B5B7C),
)

/** Vector OmniTune concentric sonic-loop brand mark. */
@Composable
fun OmniTuneLogoMark(size: Dp = 30.dp) {
    Canvas(modifier = Modifier.size(size)) {
        val s = this.size.minDimension / 100f
        drawRoundRect(Color(0xFF0A1429), cornerRadius = CornerRadius(22f * s, 22f * s))
        val stroke = Stroke(width = 6.4f * s, cap = StrokeCap.Butt, join = StrokeJoin.Round)
        val c = Offset(46f * s, 53f * s)
        fun arc(r: Float, start: Float, sweep: Float, color: Color) = drawArc(
            color = color, startAngle = start, sweepAngle = sweep, useCenter = false,
            topLeft = Offset(c.x - r * s, c.y - r * s), size = Size(2 * r * s, 2 * r * s), style = stroke,
        )
        arc(15.6f, 112f, 338f, OmniTuneAccent)
        drawLine(OmniTuneAccent, Offset(c.x, c.y + 15.6f * s), Offset(c.x, c.y + 29.2f * s), strokeWidth = 6.4f * s)
        arc(29.2f, 90f, 208f, OmniTuneAccent)
        arc(29.2f, 308f, 128f, OmniTuneAccent)
        arc(39f, 300f, 60f, OmniTuneAccentSoft)
    }
}

@Composable
fun OmniTuneTheme(darkTheme: Boolean, content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        content = content,
    )
}

@Composable
fun ArtworkImage(
    url: String?,
    size: Dp,
    pixelSize: Int = 300,
    cornerRadius: Dp = 9.dp,
    circle: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val shape = if (circle) CircleShape else RoundedCornerShape(cornerRadius)
    val resolved = remember(url, pixelSize) { artworkAt(url, pixelSize) }
    Box(
        modifier = modifier
            .size(size)
            .clip(shape)
            .background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Rounded.MusicNote,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(size * 0.36f),
        )
        if (resolved.isNotBlank()) {
            AsyncImage(
                model = resolved,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

@Composable
fun MosaicArtwork(urls: List<String>, size: Dp, cornerRadius: Dp = 9.dp) {
    val clean = remember(urls) { urls.filter { it.isNotBlank() }.distinct().take(4) }
    if (clean.size < 4) {
        ArtworkImage(clean.firstOrNull(), size = size, cornerRadius = cornerRadius)
        return
    }
    val half = size / 2
    Column(modifier = Modifier.size(size).clip(RoundedCornerShape(cornerRadius))) {
        Row {
            ArtworkImage(clean[0], size = half, pixelSize = 200, cornerRadius = 0.dp)
            ArtworkImage(clean[1], size = half, pixelSize = 200, cornerRadius = 0.dp)
        }
        Row {
            ArtworkImage(clean[2], size = half, pixelSize = 200, cornerRadius = 0.dp)
            ArtworkImage(clean[3], size = half, pixelSize = 200, cornerRadius = 0.dp)
        }
    }
}

@Composable
fun ArtistAvatar(artistId: String, initialUrl: String?, catalog: CatalogProvider, size: Dp) {
    var resolved by remember(artistId) { mutableStateOf(initialUrl) }
    LaunchedEffect(artistId) {
        if (resolved.isNullOrBlank()) resolved = catalog.getArtistArtwork(artistId)
    }
    ArtworkImage(resolved, size = size, circle = true)
}

@Composable
fun FilterChipPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        shape = CircleShape,
        color = if (selected) OmniTuneAccent else MaterialTheme.colorScheme.surfaceVariant,
        modifier = Modifier.clip(CircleShape).clickable(onClick = onClick),
    ) {
        Text(
            text = label,
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurface,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 7.dp),
        )
    }
}
