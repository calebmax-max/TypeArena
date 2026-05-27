import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpectateRoom({ fetchLiveRaceRoom, pollIntervalMs }) {
  const [spectateRoom, setSpectateRoom] = useState(null);
  const [spectateData, setSpectateData] = useState(null);
  const intervalRef = useRef(null);
  const inFlightRef = useRef(false);

  const stopWatching = useCallback(() => {
    window.clearInterval(intervalRef.current);
    intervalRef.current = null;
    setSpectateRoom(null);
    setSpectateData(null);
  }, []);

  const watchRoom = useCallback((roomId) => {
    setSpectateRoom(roomId);

    const poll = async () => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const room = await fetchLiveRaceRoom(roomId);
        setSpectateData(room);
        if (room?.status === 'completed') {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      } catch {
        // ignore transient spectator polling errors
      } finally {
        inFlightRef.current = false;
      }
    };

    window.clearInterval(intervalRef.current);
    poll();
    intervalRef.current = window.setInterval(poll, pollIntervalMs);
  }, [fetchLiveRaceRoom, pollIntervalMs]);

  useEffect(() => () => window.clearInterval(intervalRef.current), []);

  return {
    spectateRoom,
    spectateData,
    watchRoom,
    stopWatching,
  };
}
