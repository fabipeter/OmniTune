# OmniTune

**Smart discovery, rich catalog & sound, one uniform Midnight-Cobalt experience on every platform.**

OmniTune is organized as a multi-platform repository with distinct, first-class targets for **Web (PWA)**, **Desktop (macOS & Windows)**, **Native Mobile (iOS SwiftUI & Android Kotlin/Jetpack Compose)**, and an optional **Sync / MusicKit Token Server**.

---

## Repository Layout

```text
OmniTune/
├── packages/
│   └── core/                 # Shared TypeScript engine (Apple catalog, Smart Shuffle, taste graph,
│                             #   autoplay radio, mixes, synced lyrics, PlayerController, LibraryStore, Sync)
├── apps/
│   ├── web/                  # Web App & installable PWA (React 19 + Vite, OmniTune 3-pane UX,
│   │                         #   WebAudio 10-band EQ + crossfade + volume normalizer + optional MusicKit JS v3)
│   ├── desktop/              # Native Desktop shell for macOS & Windows (Electron wrapping apps/web)
│   │   ├── main.cjs          #   Hardware media keys, tray controls, macOS traffic-lights / Windows overlay
│   │   ├── preload.cjs       #   Context-isolated window.omnitune bridge
│   │   └── mac/              #   macOS hardened-runtime entitlements
│   ├── mobile/
│   │   ├── ios/              # Native iOS App (Swift 6 + SwiftUI + AVFoundation + native MusicKit)
│   │   │   ├── OmniTune.xcodeproj
│   │   │   ├── Package.swift #   OmniTuneCore Swift package + XCTest suite
│   │   │   ├── OmniTuneCore/ #   Apple catalog, Smart Shuffle, taste graph, Radio, LRCLIB, Library, Player
│   │   │   └── OmniTuneApp/  #   OmniTune UI (#1E63FF, 4 tabs, docked Now Playing bar)
│   │   └── android/          # Native Android App (Kotlin 2.1 + Jetpack Compose + Media3 ExoPlayer)
│   │       ├── app/src/main/java/app/omnitune/android/
│   │       │   ├── core/     #   Apple catalog, Smart Shuffle, taste graph, Radio, LRCLIB, Library, Player
│   │       │   ├── audio/    #   ExoPlayer + MediaSessionService (background playback & lock-screen controls)
│   │       │   └── ui/       #   OmniTune UI (#1E63FF, 4 tabs, docked Now Playing bar)
│   │       └── app/src/test/ #   JUnit unit tests
│   └── server/               # Optional Fastify + built-in Node SQLite server:
│                             #   Accounts, cross-device LWW library sync, Apple catalog cache, MusicKit JWT signer
├── assets/brand/             # Vector logos & rendered icons (logo-derived cobalt on midnight navy)
├── docs/
│   ├── PRODUCT_SPEC.md       # Feature parity matrix & UI specifications
│   └── ARCHITECTURE.md       # Catalog, shuffle algorithm, audio engines & honest playback limits
└── .github/workflows/        # CI for TS/Web/Server, macOS & Windows desktop releases, Native iOS & Android CI
```

---

## Feature Highlights

- **Catalog Data & Sound**: Live search, charts, albums, artists, genres, and full-length podcasts backed by Apple’s catalog APIs (`itunes.apple.com` + `rss.marketingtools.apple.com`), plus **native MusicKit** support on iOS and **MusicKit JS v3** on Web/Desktop for full-length Lossless / High-quality streaming when authorized (without linking, songs stream Apple’s 30-second AAC previews and are clearly badged `PREVIEW`; podcasts always play full-length).
- **OmniTune Smart Algorithm**:
  - **Smart Shuffle** (`Efraimidis–Spirakis` weighted sampling + artist/album gap spreading): promotes artists/genres you finish and like, demotes tracks you skip or heard recently, and prevents back-to-back songs by the same artist or album.
  - **Autoplay Radio & Made-for-You Mixes**: builds endless radio queues when a playlist/album ends, plus on-device `On Repeat`, `Daily Mix`, and `Discover Mix` playlists from your time-decayed taste profile.
- **One UX Everywhere**:
  - **Web & Desktop**: 3-pane OmniTune layout (resizable/collapsible library sidebar, gradient-tinted detail pages, collapsible Now Playing / Queue / Synced Lyrics / Connect Devices panel, bottom transport bar), **OmniTune Connect** (live device switching & remote control across Web, Mac, Windows, iOS & Android), drag-and-drop playlist & queue reordering, drag tracks onto sidebar playlists, right-click context menus, 10-band WebAudio EQ + presets, equal-power crossfade, gapless preload, volume normalization, sleep timer, podcast speed & ±15/30s skips, keyboard shortcuts, and hardware media keys.
  - **Native iOS & Android**: The same **OmniTune UI** (`#1E63FF` accent, 4-tab navigation `Home · Search · Radio · Library`, quick-pick grid, rounded artwork, docked Now Playing bar with progress hairline, full-screen Now Playing sheet with scaling artwork, karaoke synced lyrics & queue) with (inline heart on every row, swipe-to-queue with haptic feedback, long-press context menus, **OmniTune Connect** device switching + native iOS AirPlay route picker, Liked Songs, playlists CRUD, Smart Shuffle, Made-for-You mixes, sleep timer).

---

## Prerequisites

| Platform | Requirements |
|---|---|
| **Web / Desktop / Server** | Node.js `>= 22.13` (uses built-in `node:sqlite`), `pnpm >= 10` |
| **Native iOS** | macOS with Xcode 16+ (iOS 17+ SDK) |
| **Native Android** | Android Studio with JDK 17+ (21 recommended) and Android SDK 37 (Gradle 9.9.2 wrapper included) |

Install JS workspace dependencies once from the repo root:

```bash
pnpm install
```

---

## Launching Locally (All Devices)

### 1. Optional Sync & MusicKit Server (`apps/server`)

All apps work **offline / guest-first** without running a server. Start the server if you want cross-device account sync, a local Apple catalog proxy, or MusicKit JS developer tokens:

```bash
cp apps/server/.env.example apps/server/.env
pnpm dev:server
# Runs on http://localhost:8787 (health check: GET http://localhost:8787/health)
```

### 2. Web App & PWA (`apps/web`)

```bash
cp apps/web/.env.example apps/web/.env   # optional
pnpm dev:web
# Opens at http://localhost:5173 (responsive mobile-web view below 900px)
```

### 3. Desktop App — macOS & Windows (`apps/desktop`)

Runs the Vite dev server and launches Electron pointing at it with native media keys, menu bar/tray controls, and OS-specific window chrome (macOS traffic lights / Windows title-bar overlay):

```bash
pnpm dev:desktop
```

To run the packaged production build locally inside Electron:

```bash
pnpm --filter @omnitune/desktop start
```

### 4. Native iOS App (`apps/mobile/ios`)

**Run unit tests from CLI:**

```bash
cd apps/mobile/ios
swift test
```

**Launch in iOS Simulator or on a physical iPhone:**

```bash
open apps/mobile/ios/OmniTune.xcodeproj
```

1. In Xcode, select the **OmniTune** scheme and choose an iOS Simulator (e.g., iPhone 16) or your connected iPhone.
2. For a physical device (and to test native **MusicKit** full-length playback), open **Signing & Capabilities**, pick your Apple Developer Team, and enable the **MusicKit** capability.
3. Press **⌘R** to build and run.

### 5. Native Android App (`apps/mobile/android`)

**Open in Android Studio (recommended):**

1. Open `apps/mobile/android` in Android Studio.
2. Let Gradle sync (uses `gradle/libs.versions.toml` and Gradle 9.9.2).
3. Select an Android Emulator (API 26–37) or a USB-debugging phone and click **Run ▶**.
   - Note: In the Android Emulator, the default sync server URL `http://10.0.2.2:8787` automatically maps to your host machine's `localhost:8787`.

**Or build & install via Gradle Wrapper CLI (requires JDK 17+ & Android SDK):**

```bash
cd apps/mobile/android
./gradlew testDebugUnitTest        # run Kotlin unit tests
./gradlew installDebug             # build and install onto a connected device/emulator
```

---

## Deploying (All Devices)

### 1. Sync & MusicKit Server (`apps/server`)

`apps/server` ships with a production `Dockerfile` and `fly.toml` (SQLite persisted on a mounted volume):

**Fly.io:**

```bash
cd apps/server
fly launch --no-deploy
fly volumes create omnitune_data --size 1 --region ams
fly secrets set JWT_SECRET="$(openssl rand -base64 48)" CORS_ORIGIN="https://your-web-domain.com"
# Optional — for full-length Web/Desktop playback via MusicKit JS:
fly secrets set APPLE_TEAM_ID="..." APPLE_KEY_ID="..." APPLE_PRIVATE_KEY="$(cat AuthKey_XXXX.p8)"
fly deploy
```

**Any Docker host (Railway / Render / VPS):**

```bash
docker build -t omnitune-server apps/server
docker run -d -p 8787:8787 -v omnitune_data:/data \
  -e JWT_SECRET="$(openssl rand -base64 48)" \
  -e CORS_ORIGIN="https://your-web-domain.com" \
  omnitune-server
```

### 2. Web App & PWA (`apps/web`)

Set environment variables in your host (`VITE_API_URL=https://api.your-domain.com`, optionally `VITE_USE_SERVER_CATALOG=1`):

- **Netlify**: Ready out-of-the-box via root [`netlify.toml`](netlify.toml) (`pnpm build:web`, publishes `apps/web/dist` with SPA fallback). Connect the repo in Netlify or run `npx netlify-cli deploy --prod`.
- **Vercel**: Import the repo with **Root Directory** = `apps/web`, **Build Command** = `cd ../.. && pnpm install && pnpm build:web`, **Output Directory** = `dist` (`apps/web/vercel.json` handles SPA rewrites).
- **Cloudflare Pages / Static Host**: Run `pnpm build:web` and upload `apps/web/dist` (`public/_redirects` included).

### 3. Desktop Installers — macOS & Windows (`apps/desktop`)

**Local packaging:**

```bash
# macOS (.dmg + .zip for Apple Silicon arm64 & Intel x64 — run on macOS)
VITE_API_URL=https://api.your-domain.com pnpm build:desktop:mac

# Windows (NSIS .exe installer for x64 & arm64 — run on Windows)
VITE_API_URL=https://api.your-domain.com pnpm build:desktop:win
```

Installers are written to `apps/desktop/release/`.

**Automated cross-OS builds via GitHub Actions:**
Push a version tag (`git tag v0.1.0 && git push origin v0.1.0`) to trigger [`.github/workflows/desktop-release.yml`](.github/workflows/desktop-release.yml), which builds macOS (`.dmg`/`.zip`) and Windows (`.exe`) installers on native runners and publishes them to a GitHub Release. Configure optional signing secrets (`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) in repository settings for notarized macOS builds.

### 4. Native iOS App — App Store / TestFlight (`apps/mobile/ios`)

1. Open `apps/mobile/ios/OmniTune.xcodeproj` in Xcode.
2. In **Signing & Capabilities**, select your Apple Developer Program team, set a unique Bundle Identifier (e.g., `com.yourorg.omnitune`), and add the **MusicKit** capability if shipping full-length playback.
3. Update `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION`.
4. Select **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App → App Store Connect** (TestFlight / App Store).

### 5. Native Android App — Google Play / APK (`apps/mobile/android`)

1. Generate a release keystore (keep it secret and outside git):
   ```bash
   keytool -genkey -v -keystore omnitune-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias omnitune
   ```
2. Configure `signingConfigs { create("release") { ... } }` in `apps/mobile/android/app/build.gradle.kts` (reading passwords from environment variables / `local.properties`).
3. Build a signed Android App Bundle (`.aab`) for Google Play or release APK:
   ```bash
   cd apps/mobile/android
   gradle bundleRelease    # -> app/build/outputs/bundle/release/app-release.aab (Google Play)
   gradle assembleRelease  # -> app/build/outputs/apk/release/app-release.apk (direct install)
   ```
4. Upload the `.aab` to the **Google Play Console** (Internal Testing → Production).

---

## Running All Tests

```bash
pnpm test              # TypeScript core (13 tests) + Sync server (3 tests)
pnpm typecheck         # TypeScript strict check across core, web, server
pnpm test:ios          # Native Swift 6 OmniTuneCore tests (4 tests)
pnpm test:android      # Native Kotlin JUnit tests (requires JDK 17 + Gradle)
```
