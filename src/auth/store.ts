import { create } from 'zustand';
import { findAccount } from './accounts';
import { connectPresence, disconnectPresence } from './presence';

export interface UserProfile {
  id: string;            // 账号 id
  name: string;          // 当前昵称
  avatar: string;        // 头像（'preset:N' 或 'data:image/...' base64）
  colorPair: [string, string]; // 头像渐变色
}

interface AuthState {
  user: UserProfile | null;
  kickedReason: string | null;  // 被踢下线时的原因，UI 用来展示提示
  login: (id: string, password: string) => boolean;
  logout: () => void;
  forceKickedOut: (reason: string) => void;
  clearKicked: () => void;
  updateProfile: (patch: Partial<UserProfile>) => void;
}

const STORAGE_KEY = 'poker_profiles_v1';
const SESSION_KEY = 'poker_current_user_v1';

interface ProfileStore { [accountId: string]: UserProfile }

function loadProfiles(): ProfileStore {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveProfiles(profiles: ProfileStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

function loadCurrent(): UserProfile | null {
  try {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return loadProfiles()[id] || null;
  } catch { return null; }
}

const PRESET_COLORS: [string, string][] = [
  ['#2d6a4f', '#143829'],
  ['#3a5e8a', '#1a2e4a'],
  ['#8a3a5a', '#4a1a2a'],
  ['#5a4a3a', '#2a1a0a'],
  ['#3a5a4a', '#1a2a1a'],
  ['#5a3a3a', '#2a1a1a'],
  ['#3a3a5a', '#1a1a2a'],
  ['#4a3a5a', '#1a1a3a'],
  ['#5a3a4a', '#2a1a26'],
  ['#3a4a5e', '#1a2638'],
];

export const useAuthStore = create<AuthState>((set, get) => ({
  user: loadCurrent(),
  kickedReason: null,

  login: (id, password) => {
    const account = findAccount(id, password);
    if (!account) return false;
    const profiles = loadProfiles();
    if (!profiles[id]) {
      const idx = parseInt(id.replace('player', '')) - 1;
      profiles[id] = {
        id,
        name: account.defaultName,
        avatar: `preset:${idx % PRESET_COLORS.length}`,
        colorPair: PRESET_COLORS[idx % PRESET_COLORS.length],
      };
      saveProfiles(profiles);
    }
    localStorage.setItem(SESSION_KEY, id);
    set({ user: profiles[id], kickedReason: null });
    // 占据全局在线槽
    connectPresence(id, (reason) => {
      // 被别处登录踢下线
      get().forceKickedOut(reason);
    });
    return true;
  },

  logout: () => {
    disconnectPresence();
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, kickedReason: null });
  },

  forceKickedOut: (reason) => {
    disconnectPresence();
    localStorage.removeItem(SESSION_KEY);
    set({ user: null, kickedReason: reason });
  },

  clearKicked: () => {
    set({ kickedReason: null });
  },

  updateProfile: (patch) => {
    const cur = get().user;
    if (!cur) return;
    const next = { ...cur, ...patch };
    const profiles = loadProfiles();
    profiles[cur.id] = next;
    saveProfiles(profiles);
    set({ user: next });
  },
}));

// 应用启动时若已有登录态，直接连 presence 占槽
if (typeof window !== 'undefined') {
  const cur = loadCurrent();
  if (cur) {
    connectPresence(cur.id, (reason) => {
      useAuthStore.getState().forceKickedOut(reason);
    });
  }
}

export { PRESET_COLORS };
