import { useCallback, useEffect, useRef, useState } from 'react';

export function useLiveFeed({ phase, fetchLiveRaces, pollIntervalMs }) {
  const [liveFeed, setLiveFeed] = useState([]);
  const inFlightRef = useRef(false);

  const refreshFeed = useCallback(async () => {
    if (phase === 'racing' || document.visibilityState !== 'visible' || inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;
    try {
      const rooms = await fetchLiveRaces().catch(() => []);
      setLiveFeed(Array.isArray(rooms) ? rooms : []);
    } finally {
      inFlightRef.current = false;
    }
  }, [fetchLiveRaces, phase]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshFeed();
      }
    };

    refreshFeed();
    document.addEventListener('visibilitychange', handleVisibility);
    const intervalId = window.setInterval(refreshFeed, pollIntervalMs);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(intervalId);
    };
  }, [pollIntervalMs, refreshFeed]);

  return { liveFeed, refreshFeed };
}
