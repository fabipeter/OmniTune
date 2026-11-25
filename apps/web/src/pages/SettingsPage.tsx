import { Link } from 'react-router-dom';
import { EQ_BANDS, EQ_PRESETS, type AudioQuality, type ShuffleMode } from '@omnitune/core';
import { API_URL, audioEngine, library, syncClient } from '../app/services';
import { useMusicKitStatus, useSettings, useSyncUser } from '../hooks/useStore';
import { useUi } from '../app/uiContext';

const COUNTRIES = [
  ['us', 'United States'],
  ['gb', 'United Kingdom'],
  ['ca', 'Canada'],
  ['de', 'Germany'],
  ['fr', 'France'],
  ['jp', 'Japan'],
  ['au', 'Australia'],
  ['br', 'Brazil'],
  ['es', 'Spain'],
  ['it', 'Italy'],
  ['nl', 'Netherlands'],
  ['se', 'Sweden'],
];

const BAND_LABELS = ['60', '170', '310', '600', '1k', '3k', '6k', '12k', '14k', '16k'];

export function SettingsPage() {
  const s = useSettings();
  const mk = useMusicKitStatus();
  const user = useSyncUser();
  const { toast } = useUi();

  const toggle = (key: 'gapless' | 'normalizeVolume' | 'autoplay' | 'explicitFilter') => {
    library.updateSettings({ [key]: !s[key] });
  };

  return (
    <div className="settings-wrap">
      <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>Settings</h1>

      {/* Account & Sync */}
      <section className="settings-section">
        <h2>Account & Sync</h2>
        <div className="setting-row">
          <div>
            <div className="setting-label">{user ? `${user.displayName} (${user.email})` : 'Guest mode (local-only)'}</div>
            <div className="setting-desc">Sync server: {API_URL}</div>
          </div>
          {user ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="pill-btn"
                onClick={async () => {
                  try {
                    const r = await syncClient.sync(library);
                    toast(`Synced (${r.pulled} remote updates)`);
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Sync failed');
                  }
                }}
              >
                Sync now
              </button>
              <button
                className="pill-btn ghost"
                onClick={async () => {
                  await syncClient.logout();
                  toast('Signed out');
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/auth" className="pill-btn primary">
              Sign in / Register
            </Link>
          )}
        </div>
      </section>

      {/* Lossless & Full-Track Streaming */}
      <section className="settings-section">
        <h2>OmniTune Full-Track Streaming (MusicKit)</h2>
        <div className="setting-row">
          <div>
            <div className="setting-label">
              {mk.authorized ? 'Full-length catalog linked (Lossless & full tracks enabled)' : 'Link MusicKit for full-length songs'}
            </div>
            <div className="setting-desc">
              {mk.available
                ? 'Requires an active MusicKit-compatible subscription. Without it, OmniTune plays 30-second AAC song previews (podcasts are always full-length).'
                : 'MusicKit developer token is not configured on the server yet. Set the developer credentials on apps/server to enable full-length songs.'}
            </div>
            {mk.error && <div style={{ color: 'var(--danger)', fontSize: 12.5, marginTop: 4 }}>{mk.error}</div>}
          </div>
          {mk.authorized ? (
            <button className="pill-btn ghost" onClick={() => void audioEngine.unauthorize()}>
              Disconnect
            </button>
          ) : (
            <button
              className="pill-btn primary"
              disabled={!mk.available || mk.loading}
              style={!mk.available ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              onClick={async () => {
                const ok = await audioEngine.authorize();
                toast(ok ? 'Full-track streaming linked!' : 'Could not authorize MusicKit');
              }}
            >
              {mk.loading ? 'Linking…' : 'Connect MusicKit'}
            </button>
          )}
        </div>
      </section>

      {/* Playback & Sound Quality */}
      <section className="settings-section">
        <h2>Playback & Sound Quality</h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">Audio quality preference</div>
            <div className="setting-desc">
              High & Lossless (ALAC) require MusicKit full-track playback; guest previews stream at 256 kbps AAC.
            </div>
          </div>
          <select
            className="select-input"
            value={s.audioQuality}
            onChange={(e) => library.updateSettings({ audioQuality: e.target.value as AudioQuality })}
          >
            <option value="auto">Auto</option>
            <option value="high">High (256 kbps AAC)</option>
            <option value="lossless">Lossless (ALAC via MusicKit)</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Shuffle algorithm</div>
            <div className="setting-desc">OmniTune Smart Shuffle spreads artists & boosts favourites while demoting skips.</div>
          </div>
          <select
            className="select-input"
            value={s.shuffleMode}
            onChange={(e) => library.updateSettings({ shuffleMode: e.target.value as ShuffleMode })}
          >
            <option value="smart">Smart Shuffle</option>
            <option value="random">True Random</option>
          </select>
        </div>

        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <div className="setting-label">Crossfade songs ({Math.round(s.crossfadeMs / 1000)} s)</div>
            <div className="setting-desc">Smooth equal-power transition between tracks.</div>
          </div>
          <input
            type="range"
            className="range-slider always-thumb"
            style={{ width: 180 }}
            min={0}
            max={12000}
            step={1000}
            value={s.crossfadeMs}
            onChange={(e) => library.updateSettings({ crossfadeMs: Number(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Gapless playback</div>
            <div className="setting-desc">Preload the next track for seamless transitions.</div>
          </div>
          <button className={`switch ${s.gapless ? 'on' : ''}`} role="switch" aria-checked={s.gapless} onClick={() => toggle('gapless')} />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Normalize volume</div>
            <div className="setting-desc">Applies a gentle WebAudio compressor so tracks play at a consistent loudness.</div>
          </div>
          <button
            className={`switch ${s.normalizeVolume ? 'on' : ''}`}
            role="switch"
            aria-checked={s.normalizeVolume}
            onClick={() => toggle('normalizeVolume')}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Autoplay radio</div>
            <div className="setting-desc">Keep playing similar music when your queue ends.</div>
          </div>
          <button className={`switch ${s.autoplay ? 'on' : ''}`} role="switch" aria-checked={s.autoplay} onClick={() => toggle('autoplay')} />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Hide explicit content</div>
            <div className="setting-desc">Skip tracks marked explicit in the OmniTune catalog.</div>
          </div>
          <button
            className={`switch ${s.explicitFilter ? 'on' : ''}`}
            role="switch"
            aria-checked={s.explicitFilter}
            onClick={() => toggle('explicitFilter')}
          />
        </div>
      </section>

      {/* 10-band WebAudio Equalizer */}
      <section className="settings-section" id="eq">
        <div className="setting-row">
          <div>
            <h2 style={{ margin: 0 }}>10-Band Equalizer</h2>
            <div className="setting-desc">Live WebAudio BiquadFilter chain across 60 Hz – 16 kHz.</div>
          </div>
          <button
            className={`switch ${s.eq.enabled ? 'on' : ''}`}
            role="switch"
            aria-checked={s.eq.enabled}
            onClick={() => library.updateSettings({ eq: { ...s.eq, enabled: !s.eq.enabled } })}
          />
        </div>

        <div className="setting-row">
          <div className="setting-label">Preset</div>
          <select
            className="select-input"
            value={s.eq.preset}
            onChange={(e) => {
              const preset = e.target.value;
              const gains = EQ_PRESETS[preset] ?? s.eq.gains;
              library.updateSettings({ eq: { enabled: true, preset, gains } });
            }}
          >
            {Object.keys(EQ_PRESETS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {!(s.eq.preset in EQ_PRESETS) && <option value="Custom">Custom</option>}
          </select>
        </div>

        <div className="eq-grid" style={{ opacity: s.eq.enabled ? 1 : 0.45 }}>
          {EQ_BANDS.map((freq, idx) => (
            <div key={freq} className="eq-col">
              <span>{(s.eq.gains[idx] ?? 0) > 0 ? `+${s.eq.gains[idx]}` : s.eq.gains[idx] ?? 0} dB</span>
              <input
                type="range"
                className="eq-slider"
                min={-12}
                max={12}
                step={1}
                value={s.eq.gains[idx] ?? 0}
                aria-label={`${BAND_LABELS[idx]} Hz`}
                onChange={(e) => {
                  const next = s.eq.gains.slice();
                  next[idx] = Number(e.target.value);
                  library.updateSettings({ eq: { enabled: true, preset: 'Custom', gains: next } });
                }}
              />
              <strong>{BAND_LABELS[idx]}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* Catalog & Appearance */}
      <section className="settings-section">
        <h2>Catalog & Appearance</h2>

        <div className="setting-row">
          <div>
            <div className="setting-label">Catalog storefront region</div>
            <div className="setting-desc">Controls charts, search results and new releases.</div>
          </div>
          <select className="select-input" value={s.country} onChange={(e) => library.updateSettings({ country: e.target.value })}>
            {COUNTRIES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Theme</div>
          </div>
          <select
            className="select-input"
            value={s.theme}
            onChange={(e) => library.updateSettings({ theme: e.target.value as 'dark' | 'light' | 'system' })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match system</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Listening history</div>
            <div className="setting-desc">Clears your history and resets your on-device taste profile.</div>
          </div>
          <button
            className="pill-btn ghost"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              library.clearHistory();
              toast('Listening history cleared');
            }}
          >
            Clear history
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h2>About OmniTune & Streaming Notes</h2>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          OmniTune brings together live global music & podcast charts, on-device taste personalisation (Smart Shuffle, endless
          autoplay radio & daily mixes), 10-band WebAudio EQ, and OmniTune Connect live device handoff across Web, Desktop, iOS,
          and Android. Without an authorized MusicKit session, song streams play 30-second AAC previews while podcast episodes
          always stream in full. Synced lyrics are powered by LRCLIB.
        </p>
      </section>
    </div>
  );
}
