// ---------------------------------------------------------------------------
// Win streak helpers — persisted across sessions
// ---------------------------------------------------------------------------
const WIN_STREAK_KEY = 'typearena_win_streak';

export const getWinStreak = () => {
  try { return JSON.parse(localStorage.getItem(WIN_STREAK_KEY) || '{"count":0,"lastDate":null}'); }
  catch { return { count: 0, lastDate: null }; }
};

export const updateWinStreak = (won) => {
  try {
    const data = getWinStreak();
    const today = new Date().toDateString();
    if (won) {
      // Only count one win per day for the streak display
      const newCount = data.lastDate === today ? data.count : data.count + 1;
      const updated = { count: newCount, lastDate: today };
      localStorage.setItem(WIN_STREAK_KEY, JSON.stringify(updated));
      return updated;
    } else {
      const reset = { count: 0, lastDate: today };
      localStorage.setItem(WIN_STREAK_KEY, JSON.stringify(reset));
      return reset;
    }
  } catch { return { count: 0, lastDate: null }; }
};