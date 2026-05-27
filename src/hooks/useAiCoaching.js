import { useEffect, useState } from 'react';
import { buildApiUrl } from '../utils/api';

export function useAiCoaching({ phase, raceResult, mistakeMap, wpmHistory }) {
  const [aiCoaching, setAiCoaching] = useState(null);
  const [aiCoachingError, setAiCoachingError] = useState(false);

  useEffect(() => {
    if (phase !== 'results' || !raceResult) {
      return undefined;
    }

    setAiCoaching('loading');
    setAiCoachingError(false);
    const controller = new AbortController();

    const topMistakes = Object.entries(mistakeMap || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([ch, n]) => `'${ch === ' ' ? 'space' : ch}' (${n}x)`)
      .join(', ') || 'none';

    const wpmTrend = Array.isArray(wpmHistory) && wpmHistory.length >= 3
      ? `${wpmHistory[0].wpm.toFixed(0)} -> ${wpmHistory[Math.floor(wpmHistory.length / 2)].wpm.toFixed(0)} -> ${wpmHistory[wpmHistory.length - 1].wpm.toFixed(0)} WPM`
      : `${raceResult.wpm.toFixed(0)} WPM`;

    const prompt = `You are a concise typing coach. A player just finished a ${raceResult.duration}s ${raceResult.mode} race.

Stats:
- WPM: ${raceResult.wpm.toFixed(1)}, Net WPM: ${raceResult.netWPM?.toFixed(1) || 'N/A'}, Accuracy: ${raceResult.accuracy.toFixed(1)}%
- WPM trend (start -> mid -> end): ${wpmTrend}
- Most-missed characters: ${topMistakes}

Give exactly 2-3 concrete, personalised drill suggestions. Each drill must name specific words or patterns to practise. Format as a short numbered list. No preamble, no sign-off. Plain text only, no markdown.`;

    fetch(buildApiUrl('/api/ai-coaching'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`AI coaching request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        const text = (data.content || []).map((block) => block.text || '').join('').trim();
        setAiCoaching(text || null);
      })
      .catch((error) => {
        if (error?.name === 'AbortError') {
          return;
        }
        setAiCoachingError(true);
        setAiCoaching(null);
      });

    return () => controller.abort();
  }, [mistakeMap, phase, raceResult, wpmHistory]);

  return { aiCoaching, aiCoachingError };
}
