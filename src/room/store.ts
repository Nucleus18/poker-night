import { create } from 'zustand';
import type { RoomConfig } from '@/engine/types';

export type RoomMode = 'local' | 'online';

export interface RoomMeta {
  id: string;            // 房间码（联机时是用户输入/分享的；本地时是随机的 r 前缀）
  mode: RoomMode;
  isHost: boolean;       // 是否为创建者（联机模式下 host 携带 config）
  config?: RoomConfig;   // 联机加入时可能为空，由服务器广播补齐
  createdAt: number;
}

interface RoomStore {
  rooms: Record<string, RoomMeta>;
  createLocalRoom: (config: RoomConfig) => string;
  createOnlineRoom: (code: string, config: RoomConfig) => void;
  joinOnlineRoom: (code: string) => void;
  getRoom: (id: string) => RoomMeta | undefined;
}

const STORAGE_KEY = 'poker_active_room';

function persist(meta: RoomMeta) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

function loadCached(id: string): RoomMeta | undefined {
  try {
    const cached = sessionStorage.getItem(STORAGE_KEY);
    if (!cached) return;
    const meta: RoomMeta = JSON.parse(cached);
    if (meta.id === id) return meta;
  } catch { /* ignore */ }
  return undefined;
}

/** 6 位字母数字房间码（避开易混淆字符） */
export function generateRoomCode(): string {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: {},

  createLocalRoom: (config) => {
    const id = 'L' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const meta: RoomMeta = { id, mode: 'local', isHost: true, config, createdAt: Date.now() };
    set((s) => ({ rooms: { ...s.rooms, [id]: meta } }));
    persist(meta);
    return id;
  },

  createOnlineRoom: (code, config) => {
    const meta: RoomMeta = { id: code, mode: 'online', isHost: true, config, createdAt: Date.now() };
    set((s) => ({ rooms: { ...s.rooms, [code]: meta } }));
    persist(meta);
  },

  joinOnlineRoom: (code) => {
    const meta: RoomMeta = { id: code, mode: 'online', isHost: false, createdAt: Date.now() };
    set((s) => ({ rooms: { ...s.rooms, [code]: meta } }));
    persist(meta);
  },

  getRoom: (id) => {
    const local = get().rooms[id];
    if (local) return local;
    return loadCached(id);
  },
}));
