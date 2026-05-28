import { create } from 'zustand';
import type { RoomConfig } from '@/engine/types';

export type RoomMode = 'local' | 'online';

export interface RoomMeta {
  id: string;            // 房间码
  mode: RoomMode;
  isHost: boolean;
  config?: RoomConfig;
  createdAt: number;
  boundAccountId?: string; // 绑定的账号（用于自动跳回房间时校验）
}

interface RoomStore {
  rooms: Record<string, RoomMeta>;
  createLocalRoom: (config: RoomConfig, accountId: string) => string;
  createOnlineRoom: (code: string, config: RoomConfig, accountId: string) => void;
  joinOnlineRoom: (code: string, accountId: string) => void;
  getRoom: (id: string) => RoomMeta | undefined;
  leaveActiveRoom: () => void;
}

const STORAGE_KEY = 'poker_active_room_v2';
// localStorage：跨浏览器关闭/重启都能恢复（和 sessionStorage 不同）

function persist(meta: RoomMeta) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

function loadCached(id: string): RoomMeta | undefined {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return;
    const meta: RoomMeta = JSON.parse(cached);
    if (meta.id === id) return meta;
  } catch { /* ignore */ }
  return undefined;
}

/** 读出当前活跃房间（用于自动跳回）；按 accountId 过滤，避免不同账号串房间 */
export function loadActiveRoomFor(accountId: string): RoomMeta | undefined {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (!cached) return;
    const meta: RoomMeta = JSON.parse(cached);
    // 房间必须是这个账号绑定的
    if (meta.boundAccountId === accountId) return meta;
  } catch { /* ignore */ }
  return undefined;
}

export function clearActiveRoom() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/** 6 位数字房间码 */
export function generateRoomCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
  return s;
}

export const useRoomStore = create<RoomStore>((set, get) => ({
  rooms: {},

  createLocalRoom: (config, accountId) => {
    const id = 'L' + Math.random().toString(36).slice(2, 7).toUpperCase();
    const meta: RoomMeta = { id, mode: 'local', isHost: true, config, createdAt: Date.now(), boundAccountId: accountId };
    set((s) => ({ rooms: { ...s.rooms, [id]: meta } }));
    persist(meta);
    return id;
  },

  createOnlineRoom: (code, config, accountId) => {
    const meta: RoomMeta = { id: code, mode: 'online', isHost: true, config, createdAt: Date.now(), boundAccountId: accountId };
    set((s) => ({ rooms: { ...s.rooms, [code]: meta } }));
    persist(meta);
  },

  joinOnlineRoom: (code, accountId) => {
    const meta: RoomMeta = { id: code, mode: 'online', isHost: false, createdAt: Date.now(), boundAccountId: accountId };
    set((s) => ({ rooms: { ...s.rooms, [code]: meta } }));
    persist(meta);
  },

  getRoom: (id) => {
    const local = get().rooms[id];
    if (local) return local;
    return loadCached(id);
  },

  leaveActiveRoom: () => {
    clearActiveRoom();
  },
}));
