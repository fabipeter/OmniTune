import XCTest
@testable import OmniTuneCore

@MainActor
final class MockAudioEngine: AudioEngineProtocol {
    var onEvent: ((AudioEngineEvent) -> Void)?
    var fullSongsEnabled = false
    var loaded: Track?
    var playing = false
    var positionMs = 0

    func load(_ track: Track, autoplay: Bool, startMs: Int?, crossfadeMs: Int) async {
        loaded = track
        positionMs = startMs ?? 0
        playing = autoplay
        onEvent?(.state(playing: autoplay, buffering: false))
        onEvent?(.time(positionMs: positionMs, durationMs: track.durationMs))
    }
    func play() { playing = true; onEvent?(.state(playing: true, buffering: false)) }
    func pause() { playing = false; onEvent?(.state(playing: false, buffering: false)) }
    func seek(ms: Int) { positionMs = ms; onEvent?(.time(positionMs: ms, durationMs: loaded?.durationMs ?? 0)) }
    func setVolume(_ volume: Float) {}
    func setRate(_ rate: Float) {}
    func preload(_ track: Track) {}
    func finish() { onEvent?(.ended) }
}

final class OmniTuneCoreTests: XCTestCase {
    private func makeTrack(_ id: String, artist: String) -> Track {
        Track(id: id, title: "Song \(id)", artistName: artist, albumId: "alb-\(artist)", durationMs: 180_000, audioUrl: "https://x/\(id).m4a")
    }

    func testSmartShuffleSpreadsArtistsAndPinsStart() {
        let tracks = (0..<50).map { makeTrack("\($0)", artist: "Artist \($0 % 10)") }
        for seed in UInt32(1)...15 {
            var rng = SeededRNG(seed: seed)
            let out = SmartShuffle.shuffle(tracks, startWith: tracks[4], rng: { rng.nextDouble() })
            XCTAssertEqual(out.count, 50)
            XCTAssertEqual(out.first?.id, "4")
            for i in 1..<out.count {
                XCTAssertNotEqual(out[i].artistName, out[i - 1].artistName)
            }
        }
    }

    func testLrcParserAndActiveIndex() {
        let lines = LrcLib.parseLrc("[00:02.50] Hello\n[00:10.00] World\n")
        XCTAssertEqual(lines.count, 2)
        XCTAssertEqual(LrcLib.activeIndex(in: lines, positionMs: 1000), -1)
        XCTAssertEqual(LrcLib.activeIndex(in: lines, positionMs: 2500), 0)
        XCTAssertEqual(LrcLib.activeIndex(in: lines, positionMs: 12000), 1)
    }

    @MainActor
    func testPlayerQueueAndRepeatSemantics() async {
        let engine = MockAudioEngine()
        let player = PlayerController(engine: engine)
        let tracks = (0..<4).map { makeTrack("\($0)", artist: "A\($0)") }
        await player.play(tracks, startIndex: 0)
        XCTAssertEqual(player.current?.id, "0")

        player.addToQueue(makeTrack("q1", artist: "Q"))
        player.playNext(makeTrack("q0", artist: "Q"))
        await player.next()
        XCTAssertEqual(player.current?.id, "q0")
        await player.next()
        XCTAssertEqual(player.current?.id, "q1")
        await player.next()
        XCTAssertEqual(player.current?.id, "1")

        player.cycleRepeat() // .all
        player.cycleRepeat() // .one
        XCTAssertEqual(player.repeatMode, .one)
    }

    @MainActor
    func testLibraryStoreLikesPlaylistsAndLwwMerge() {
        let a = LibraryStore(fileURL: nil)
        let b = LibraryStore(fileURL: nil)
        let t = makeTrack("1", artist: "Daft Punk")
        XCTAssertTrue(a.toggleLike(t))
        XCTAssertTrue(a.isLiked("1"))
        let pl = a.createPlaylist(name: "Night Drive", tracks: [t])
        XCTAssertEqual(a.playlist(id: pl.id)?.tracks.count, 1)
        XCTAssertEqual(b.likedTracks.count, 0)
    }
}
