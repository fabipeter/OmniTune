import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Mix, Playlist, Track } from '@omnitune/core';

export type RightPanelTab = 'now-playing' | 'queue' | 'lyrics' | 'devices' | null;

export interface ContextMenuState {
  x: number;
  y: number;
  track: Track;
  playlistId?: string;
}

export interface PlaylistModalState {
  mode: 'create' | 'edit';
  playlist?: Playlist;
  initialTracks?: Track[];
}

interface ToastItem {
  id: number;
  text: string;
}

interface UiContextValue {
  rightPanel: RightPanelTab;
  setRightPanel: (tab: RightPanelTab) => void;
  toggleRightPanel: (tab: Exclude<RightPanelTab, null>) => void;
  fullscreen: boolean;
  setFullscreen: (v: boolean) => void;
  sleepModalOpen: boolean;
  setSleepModalOpen: (v: boolean) => void;
  contextMenu: ContextMenuState | null;
  openContextMenu: (e: React.MouseEvent, track: Track, playlistId?: string) => void;
  closeContextMenu: () => void;
  playlistModal: PlaylistModalState | null;
  openCreatePlaylist: (initialTracks?: Track[]) => void;
  openEditPlaylist: (playlist: Playlist) => void;
  closePlaylistModal: () => void;
  toasts: ToastItem[];
  toast: (text: string) => void;
  mixes: Record<string, Mix>;
  rememberMixes: (list: Mix[]) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const UiContext = createContext<UiContextValue | null>(null);
let toastSeq = 0;

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [rightPanel, setRightPanel] = useState<RightPanelTab>('now-playing');
  const [fullscreen, setFullscreen] = useState(false);
  const [sleepModalOpen, setSleepModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [playlistModal, setPlaylistModal] = useState<PlaylistModalState | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [mixes, setMixes] = useState<Record<string, Mix>>({});
  const [searchQuery, setSearchQuery] = useState('');

  const toggleRightPanel = useCallback((tab: Exclude<RightPanelTab, null>) => {
    setRightPanel((cur) => (cur === tab ? null : tab));
  }, []);

  const openContextMenu = useCallback((e: React.MouseEvent, track: Track, playlistId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 235);
    const y = Math.min(e.clientY, window.innerHeight - 310);
    setContextMenu({ x: Math.max(8, x), y: Math.max(8, y), track, playlistId });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openCreatePlaylist = useCallback((initialTracks?: Track[]) => setPlaylistModal({ mode: 'create', initialTracks }), []);
  const openEditPlaylist = useCallback((playlist: Playlist) => setPlaylistModal({ mode: 'edit', playlist }), []);
  const closePlaylistModal = useCallback(() => setPlaylistModal(null), []);

  const toast = useCallback((text: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev.slice(-2), { id, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const rememberMixes = useCallback((list: Mix[]) => {
    setMixes((prev) => {
      const next = { ...prev };
      for (const m of list) next[m.id] = m;
      return next;
    });
  }, []);

  return (
    <UiContext.Provider
      value={{
        rightPanel,
        setRightPanel,
        toggleRightPanel,
        fullscreen,
        setFullscreen,
        sleepModalOpen,
        setSleepModalOpen,
        contextMenu,
        openContextMenu,
        closeContextMenu,
        playlistModal,
        openCreatePlaylist,
        openEditPlaylist,
        closePlaylistModal,
        toasts,
        toast,
        mixes,
        rememberMixes,
        searchQuery,
        setSearchQuery,
      }}
    >
      {children}
    </UiContext.Provider>
  );
}

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside UiProvider');
  return ctx;
}
