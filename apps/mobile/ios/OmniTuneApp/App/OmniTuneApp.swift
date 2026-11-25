#if canImport(OmniTuneCore)
import OmniTuneCore
#endif
import SwiftUI
import UIKit

@main
public struct OmniTuneApp: App {
    @State private var env = OmniTuneEnvironment()

    public init() {
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithDefaultBackground()
        tabAppearance.backgroundColor = UIColor(red: 0.027, green: 0.051, blue: 0.106, alpha: 0.95)
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }

    public var body: some Scene {
        WindowGroup {
            RootTabView()
                .environment(env)
                .preferredColorScheme(preferredScheme)
        }
    }

    private var preferredScheme: ColorScheme? {
        switch env.library.settings.theme {
        case .system: return .dark
        case .dark: return .dark
        case .light: return .light
        }
    }
}
