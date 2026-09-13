// ---------------------------------------------------------------------------
// Personal Best helpers — stored in localStorage per mode+language+duration
// ---------------------------------------------------------------------------
const PB_KEY = 'typearena_personal_bests';

export const getPB = (mode, language, duration) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    return store[`${mode}__${language}__${duration}`] || null;
  } catch { return null; }
};

// Also persists replayFrames alongside the PB, so the ghost cursor and
// replay scrubber have something to draw from on a later attempt.
export const savePB = (mode, language, duration, wpm, accuracy, frames = []) => {
  try {
    const store = JSON.parse(localStorage.getItem(PB_KEY) || '{}');
    const key = `${mode}__${language}__${duration}`;
    // Storing full typedText strings in every frame could exceed the
    // localStorage quota (300 frames * ~2000 chars ~= 600 KB per PB entry).
    // Store only the typed character count per frame — enough to drive the
    // ghost cursor and replay scrubber, at a fraction of the size.
    const compactFrames = frames.map((f) => ({
      len: typeof f.typedText === 'string' ? f.typedText.length : (f.len || 0),
      timestamp: f.timestamp,
    }));
    store[key] = { wpm, accuracy, date: new Date().toISOString(), frames: compactFrames };
    localStorage.setItem(PB_KEY, JSON.stringify(store));
  } catch {}
};