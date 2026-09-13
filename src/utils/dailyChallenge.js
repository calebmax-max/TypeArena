// ---------------------------------------------------------------------------
// Daily challenge helpers — one shared passage per calendar day
// ---------------------------------------------------------------------------
const DAILY_CHALLENGE_KEY = 'typearena_daily_challenge';

export const getDailyChallenge = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(DAILY_CHALLENGE_KEY) || 'null');
    const today = new Date().toDateString();
    if (stored && stored.date === today) return stored;
    return null;
  } catch { return null; }
};

export const saveDailyChallenge = (entry) => {
  try {
    localStorage.setItem(DAILY_CHALLENGE_KEY, JSON.stringify({ ...entry, date: new Date().toDateString() }));
  } catch {}
};