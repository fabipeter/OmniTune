import { BrowserRouter, HashRouter, Link, Route, Routes } from 'react-router-dom';
import { UiProvider } from './app/uiContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { SearchPage } from './pages/SearchPage';
import {
  AlbumPage,
  ArtistPage,
  GenrePage,
  LibraryPage,
  LikedPage,
  MixPage,
  PlaylistPage,
  PodcastPage,
  QueuePage,
  RadioPage,
  RecentPage,
} from './pages/CollectionPages';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';

function NotFoundPage() {
  return (
    <div className="empty-state">
      <h1>404</h1>
      <p>That page doesn’t exist in OmniTune.</p>
      <Link to="/" className="pill-btn primary">
        Back to Home
      </Link>
    </div>
  );
}

const isDesktop = Boolean(window.omnitune?.isDesktop || window.location.protocol === 'file:');

export function App() {
  const Router = isDesktop ? HashRouter : BrowserRouter;
  return (
    <UiProvider>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="search" element={<SearchPage />} />
            <Route path="radio" element={<RadioPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="liked" element={<LikedPage />} />
            <Route path="recent" element={<RecentPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="album/:id" element={<AlbumPage />} />
            <Route path="artist/:id" element={<ArtistPage />} />
            <Route path="podcast/:id" element={<PodcastPage />} />
            <Route path="playlist/:id" element={<PlaylistPage />} />
            <Route path="mix/:id" element={<MixPage />} />
            <Route path="genre/:id" element={<GenrePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Router>
    </UiProvider>
  );
}
