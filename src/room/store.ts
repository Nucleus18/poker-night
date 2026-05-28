import { create } from 'zustand';
import type { RoomConfig } from '@/engine/types';

export interface RoomMeta {
  id: string;
  config: RoomConfig;
  createdBy: string;
  createdAt: number;
}

interface RoomStore {
  rooms: Record<string, RoomMeta>;
  createRoom: (config: RoomConfig) => string;
  getRoom: (id: string) => RoomMeta | undefined;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: {},
  createRoom: (config) => {
    const id = 'r' + Math.random().toString(36).slice(2, 8);
    const meta: RoomMeta = {
      id,
      config,
      createdBy: '',
      createdAt: Date.now(),
    };
    set((s) => ({ rooms: { ...s.rooms, [id]: meta } }));
    sessionStorage.setItem('poker_active_room', JSON.stringify(meta));
    return id;
  },
  getRoom: (id) => {
    const local = get().rooms[id];
    if (local) return local;
    try {
      const cached = sessionStorage.getItem('poker_active_room');
      if (cached) {
        const meta: RoomMeta = JSON.parse(cached);
        if (meta.id === id) return meta;
      }
    } catch { /* ignore */ }
    return undefined;
  },
}));
