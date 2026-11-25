import { useEffect, useState, useSyncExternalStore } from 'react';
import { colorFromString, type Settings } from '@omnitune/core';
import { audioEngine, connectClient, library, player, syncClient } from '../app/services';

export function useLibraryVersion(): number {
  return useSyncExternalStore(library.subscribe, () => library.getSnapshot().version);
}

export function useLibrary<T>(selector: () => T): T {
  useLibraryVersion();
  return selector();
}

export function useSettings(): Settings {
  useLibraryVersion();
  return library.getSettings();
}

export function usePlayer() {
  return useSyncExternalStore(player.subscribe, player.getState);
}

export function useProgress() {
  const [progress, setProgress] = useState(() => player.getProgress());
  useEffect(() => {
    setProgress(player.getProgress());
    return player.subscribeProgress((positionMs, durationMs) => setProgress({ positionMs, durationMs }));
  }, []);
  return progress;
}

export function useMusicKitStatus() {
  return useSyncExternalStore(audioEngine.subscribeStatus, audioEngine.getStatus);
}

export function useSyncUser() {
  return useSyncExternalStore(syncClient.subscribe, () => syncClient.user);
}

export function useConnect() {
  return useSyncExternalStore(connectClient.subscribe, connectClient.getState);
}

const RECENT_SEARCH_KEY = 'omnitune.recentSearches';

export function useRecentSearches() {
  const [items, setItems] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SEARCH_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const add = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setItems((prev) => {
      const next = [trimmed, ...prev.filter((x) => x.toLowerCase() !== trimmed.toLowerCase())].slice(0, 10);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  };
  const remove = (q: string) => {
    setItems((prev) => {
      const next = prev.filter((x) => x !== q);
      localStorage.setItem(RECENT_SEARCH_KEY, JSON.stringify(next));
      return next;
    });
  };
  const clear = () => {
    localStorage.removeItem(RECENT_SEARCH_KEY);
    setItems([]);
  };

  return { items, add, remove, clear };
}

export function useHeaderTint(seed: string) {
  return colorFromString(seed || 'omnitune', 48, 28);
}
