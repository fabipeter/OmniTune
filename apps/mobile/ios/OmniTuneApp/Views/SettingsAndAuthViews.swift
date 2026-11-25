#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

public struct SettingsView: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @State private var showAuthSheet = false
    @State private var mkStatusText = ""

    private let countries = [
        ("us", "United States"), ("gb", "United Kingdom"), ("ca", "Canada"),
        ("de", "Germany"), ("fr", "France"), ("jp", "Japan"), ("au", "Australia"),
    ]

    public var body: some View {
        let _ = env.library.version
        let s = env.library.settings

        Form {
            Section("OmniTune Full-Track Streaming (MusicKit)") {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(env.audioEngine.musicKitAuthorized ? "MusicKit Authorized" : "Connect MusicKit")
                            .font(.body.weight(.semibold))
                        Text(env.audioEngine.musicKitAuthorized
                             ? "Full-length Lossless & High-Quality song playback enabled via native MusicKit."
                             : "Authorize native MusicKit for full-length songs. Without it, OmniTune plays 30-second AAC song previews and full-length podcasts.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Button(env.audioEngine.musicKitAuthorized ? "Re-check MusicKit Status" : "Authorize MusicKit") {
                    Task {
                        let ok = await env.audioEngine.authorizeMusicKit()
                        mkStatusText = ok ? "Full-track MusicKit enabled" : "Permission not granted (preview mode active)"
                        env.toast(mkStatusText)
                    }
                }
                .foregroundStyle(OmniTuneTheme.accent)
            }

            Section("Account & Cross-Device Sync") {
                if let user = env.library.user {
                    VStack(alignment: .leading) {
                        Text(user.displayName).font(.headline)
                        Text(user.email).font(.caption).foregroundStyle(.secondary)
                    }
                    Button("Sync Library Now") {
                        Task {
                            do {
                                let n = try await env.library.syncNow()
                                env.toast("Synced (\(n) updates)")
                            } catch {
                                env.toast("Sync failed: \(error.localizedDescription)")
                            }
                        }
                    }
                    Button("Sign Out", role: .destructive) { env.library.logout() }
                } else {
                    Button("Sign In / Create Account") { showAuthSheet = true }
                        .foregroundStyle(OmniTuneTheme.accent)
                }

                TextField("Sync Server URL", text: Binding(
                    get: { env.library.settings.serverUrl },
                    set: { val in env.library.updateSettings { $0.serverUrl = val } }
                ))
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            }

            Section("Playback & Algorithm") {
                Picker("Audio Quality", selection: Binding(
                    get: { s.audioQuality },
                    set: { v in env.library.updateSettings { $0.audioQuality = v } }
                )) {
                    Text("Auto").tag(AudioQuality.auto)
                    Text("High (256 kbps AAC)").tag(AudioQuality.high)
                    Text("Lossless (ALAC via MusicKit)").tag(AudioQuality.lossless)
                }

                Picker("Shuffle Algorithm", selection: Binding(
                    get: { s.shuffleMode },
                    set: { v in env.library.updateSettings { $0.shuffleMode = v } }
                )) {
                    Text("OmniTune Smart Shuffle").tag(ShuffleMode.smart)
                    Text("True Random").tag(ShuffleMode.random)
                }

                VStack(alignment: .leading) {
                    Text("Crossfade: \(s.crossfadeMs / 1000)s")
                    Slider(
                        value: Binding(
                            get: { Double(s.crossfadeMs / 1000) },
                            set: { v in env.library.updateSettings { $0.crossfadeMs = Int(v) * 1000 } }
                        ),
                        in: 0...12,
                        step: 1
                    )
                    .tint(OmniTuneTheme.accent)
                }

                Toggle("Gapless Playback", isOn: Binding(
                    get: { s.gapless },
                    set: { v in env.library.updateSettings { $0.gapless = v } }
                ))
                Toggle("Autoplay Radio", isOn: Binding(
                    get: { s.autoplay },
                    set: { v in env.library.updateSettings { $0.autoplay = v } }
                ))
                Toggle("Hide Explicit Content", isOn: Binding(
                    get: { s.explicitFilter },
                    set: { v in env.library.updateSettings { $0.explicitFilter = v } }
                ))
            }

            Section("Catalog & Appearance") {
                Picker("Storefront Region", selection: Binding(
                    get: { s.country },
                    set: { code in
                        env.library.updateSettings { $0.country = code }
                        Task { await env.catalog.setCountry(code) }
                    }
                )) {
                    ForEach(countries, id: \.0) { code, label in Text(label).tag(code) }
                }

                Picker("Appearance", selection: Binding(
                    get: { s.theme },
                    set: { v in env.library.updateSettings { $0.theme = v } }
                )) {
                    Text("Midnight Dark (Default)").tag(AppTheme.system)
                    Text("Dark").tag(AppTheme.dark)
                    Text("Light").tag(AppTheme.light)
                }

                Button("Clear Listening History", role: .destructive) {
                    env.library.clearHistory()
                    env.toast("History cleared")
                }
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showAuthSheet) { AuthSheet() }
    }
}

public struct AuthSheet: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var isRegister = false
    @State private var email = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var errorMsg: String?
    @State private var busy = false

    public var body: some View {
        NavigationStack {
            Form {
                if isRegister {
                    TextField("Display Name", text: $displayName)
                }
                TextField("Email", text: $email)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                SecureField("Password (8+ chars)", text: $password)

                if let errorMsg {
                    Text(errorMsg).foregroundStyle(.red).font(.caption)
                }

                Button(busy ? "Please wait…" : (isRegister ? "Create Account" : "Sign In")) {
                    submit()
                }
                .disabled(busy || email.isEmpty || password.count < 8)
                .foregroundStyle(OmniTuneTheme.accent)

                Button(isRegister ? "Already have an account? Sign In" : "Need an account? Register") {
                    isRegister.toggle()
                    errorMsg = nil
                }
                .font(.footnote)
            }
            .navigationTitle(isRegister ? "Register" : "Sign In")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
        }
    }

    private func submit() {
        busy = true
        errorMsg = nil
        Task {
            do {
                if isRegister {
                    try await env.library.register(email: email, password: password, displayName: displayName)
                } else {
                    try await env.library.login(email: email, password: password)
                }
                env.toast("Signed in!")
                dismiss()
            } catch {
                errorMsg = error.localizedDescription
            }
            busy = false
        }
    }
}
