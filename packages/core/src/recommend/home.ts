import type { CatalogProvider } from '../catalog/apple';
import type { LibraryStore } from '../library/store';
import { buildMixes } from './radio';
import type { HomeShelf, Settings } from '../types';
import { GENRES } from '../catalog/genres';

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
export { greeting };

/**
 * Builds the Home feed shared by every client. Each shelf loads independently so a slow or failing
 * source never blanks the whole page. Personalised shelves come first (OmniTune),
 * followed by Apple charts and editorial-ish discovery.
 */
export async function buildHomeFeed(catalog: CatalogProvider, library: LibraryStore, settings: Settings): Promise<HomeShelf[]> {
  const taste = library.taste();
  const recent = library.recentlyPlayed(30);
  const shelves: HomeShelf[] = [];

  if (recent.length) {
    shelves.push({ id: 'recent', title: 'Jump back in', items: recent.slice(0, 12).map((track) => ({ type: 'track', track })) });
  }
  const playlists = library.playlists();
  if (playlists.length) {
    shelves.push({ id: 'playlists', title: 'Your playlists', items: playlists.slice(0, 12).map((playlist) => ({ type: 'playlist', playlist })) });
  }

  const [mixes, songs, albums, releases, podcasts] = await Promise.allSettled([
    buildMixes(catalog, taste, recent, { explicitFilter: settings.explicitFilter }),
    catalog.getTopSongs(30),
    catalog.getTopAlbums(20),
    catalog.getNewReleases(20),
    catalog.getTopPodcasts(15),
  ]);

  if (mixes.status === 'fulfilled' && mixes.value.length) {
    shelves.push({
      id: 'mixes',
      title: taste.isEmpty ? 'Start listening' : 'Made for you',
      subtitle: taste.isEmpty ? 'Play a few songs and your mixes will get personal' : 'Built from what you play, like and skip',
      items: mixes.value.map((mix) => ({ type: 'mix', mix })),
    });
  }
  if (songs.status === 'fulfilled' && songs.value.length) {
    shelves.push({ id: 'top-songs', title: 'Top songs right now', items: songs.value.map((track) => ({ type: 'track', track })) });
  }
  if (releases.status === 'fulfilled' && releases.value.length) {
    shelves.push({ id: 'new', title: 'New releases', items: releases.value.map((album) => ({ type: 'album', album })) });
  }
  if (albums.status === 'fulfilled' && albums.value.length) {
    shelves.push({ id: 'top-albums', title: 'Popular albums', items: albums.value.map((album) => ({ type: 'album', album })) });
  }
  if (podcasts.status === 'fulfilled' && podcasts.value.length) {
    shelves.push({ id: 'podcasts', title: 'Popular podcasts', items: podcasts.value.map((podcast) => ({ type: 'podcast', podcast })) });
  }
  const followed = library.followedArtists();
  if (followed.length) {
    shelves.splice(Math.min(shelves.length, 3), 0, { id: 'artists', title: 'Artists you follow', items: followed.slice(0, 12).map((artist) => ({ type: 'artist', artist })) });
  }
  void GENRES;
  return shelves;
}
