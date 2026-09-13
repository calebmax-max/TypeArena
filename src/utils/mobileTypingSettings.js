export const MOBILE_TYPING_SETTINGS_KEY = 'typearena_mobile_typing_settings';

const DEFAULT_MOBILE_TYPING_SETTINGS = {
  autoScroll: true,
  guide: true,
  haptics: true,
};

export function readMobileTypingSettings() {
  try {
    const raw = localStorage.getItem(MOBILE_TYPING_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MOBILE_TYPING_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_MOBILE_TYPING_SETTINGS };
    return { ...DEFAULT_MOBILE_TYPING_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_MOBILE_TYPING_SETTINGS };
  }
}