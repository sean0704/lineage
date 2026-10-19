import { defaultQuality, type Quality } from '../render/PostFX';

const KEY = 'lineage3d.settings';

export interface Settings {
  quality: Quality;
}

/** 讀取顯示設定（儲存空間不可用時使用預設值） */
export function loadSettings(): Settings {
  const fallback: Settings = { quality: defaultQuality() };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const s = JSON.parse(raw) as Partial<Settings>;
    return { quality: s.quality === 'high' || s.quality === 'medium' || s.quality === 'low' ? s.quality : fallback.quality };
  } catch {
    return fallback;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 無法儲存時忽略 */
  }
}
