import AVKit
#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI

/// Native iOS AirPlay & Bluetooth output route picker (`AVRoutePickerView`).
public struct AirPlayRoutePicker: UIViewRepresentable {
    public func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.tintColor = UIColor(OmniTuneTheme.accent)
        picker.activeTintColor = UIColor(OmniTuneTheme.accentHover)
        picker.prioritizesVideoDevices = false
        return picker
    }

    public func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}

/// OmniTune Connect live device switching sheet + native AirPlay speaker picker.
public struct DevicesSheet: View {
    @Environment(OmniTuneEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var roomDraft = ""

    public var body: some View {
        let connect = env.connect
        NavigationStack {
            List {
                Section("AirPlay & Bluetooth") {
                    HStack {
                        Label("Speakers & TVs (AirPlay)", systemImage: "airplayaudio")
                            .foregroundStyle(.primary)
                        Spacer()
                        AirPlayRoutePicker()
                            .frame(width: 34, height: 34)
                    }
                }

                Section("OmniTune Connect") {
                    if !connect.connected {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Connect server offline")
                                .font(.subheadline.weight(.semibold))
                            Text("Run apps/server and point Settings → Sync Server URL to it to switch playback across your Mac, Windows, Web, iOS, and Android devices.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Button("Retry Connection") { connect.reconnect() }
                                .foregroundStyle(OmniTuneTheme.accent)
                        }
                        .padding(.vertical, 4)
                    } else {
                        ForEach(connect.devices) { dev in
                            Button {
                                guard !dev.isActive else { return }
                                Haptics.medium()
                                Task {
                                    do {
                                        try await connect.transferTo(deviceId: dev.id, autoplay: true)
                                        env.toast("Switched playback to \(dev.name)")
                                        dismiss()
                                    } catch {
                                        env.toast("Failed to switch device")
                                    }
                                }
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: iconName(for: dev.type))
                                        .font(.title3)
                                        .foregroundStyle(dev.isActive ? OmniTuneTheme.accentHover : .secondary)
                                        .frame(width: 28)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(dev.id == connect.thisDeviceId ? "This \(dev.name)" : dev.name)
                                            .font(.body.weight(dev.isActive ? .bold : .regular))
                                            .foregroundStyle(dev.isActive ? OmniTuneTheme.accentHover : .primary)
                                        Text(dev.isActive ? (dev.playing ? "Listening now" : "Active device") : "Tap to switch playback")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    if dev.isActive {
                                        Image(systemName: "waveform")
                                            .foregroundStyle(OmniTuneTheme.accentHover)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if env.library.user == nil {
                    Section("Guest Pairing Room") {
                        HStack {
                            TextField("Room code (e.g. local)", text: $roomDraft)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                            Button("Join") {
                                connect.setRoomCode(roomDraft)
                                env.toast("Joined room \(connect.roomCode)")
                            }
                            .foregroundStyle(OmniTuneTheme.accent)
                        }
                    }
                }
            }
            .navigationTitle("Connect to a Device")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .onAppear { roomDraft = connect.roomCode }
        }
    }

    private func iconName(for type: String) -> String {
        switch type {
        case "ios", "android": return "iphone"
        case "desktop-mac", "desktop-win": return "laptopcomputer"
        default: return "globe"
        }
    }
}
