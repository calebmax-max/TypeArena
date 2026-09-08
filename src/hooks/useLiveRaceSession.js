import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateAccuracy,
  calculateWPM,
  generateRaceId,
} from '../utils/typingEngine';
import {
  cancelLiveRaceRoom,
  fetchLiveRaceRoom,
  queueLiveRace,
  submitLiveRaceResult,
  updateLiveRaceHeartbeat,
} from '../utils/typingApi';

const LIVE_RACE_COUNTDOWN_FALLBACK = 10;
const LIVE_CLOCK_SYNC_INTERVAL_MS = 250;
const LIVE_ROOM_POLL_QUEUED_MS = 500;
const LIVE_ROOM_POLL_ACTIVE_MS = 4000;
const LIVE_ROOM_POLL_RESULTS_MS = 2500;

export function useLiveRaceSession({
  currentUser,
  phase,
  setPhase,
  mode,
  setMode,
  language,
  setLanguage,
  duration,
  setDuration,
  friendBattle,
  setFriendBattle,
  tournamentId,
  wpmFilter,
  generatedContentPassage,
  redirectToProfile,
  navigate,
  refreshFeed,
  showNotice,
  inputRef,
  typingTextRef,
  timeLeftRef,
  replayFramesRef,
  getModeDescription,
  getUsedContentIds,
  recordUsedContentId,
  persistLatestRaceResult,
  setRaceResult,
  setTypingText,
  setReplayFrames,
  setRaceOver,
  setTimeLeft,
}) {
  const [liveRoom, setLiveRoom] = useState(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveAction, setLiveAction] = useState(null);
  const [countdownRemaining, setCountdownRemaining] = useState(LIVE_RACE_COUNTDOWN_FALLBACK);
  const [queueElapsed, setQueueElapsed] = useState(0);
  const [pendingRematch, setPendingRematch] = useState(false);

  const heartbeatTimerRef = useRef(null);
  const heartbeatPayloadRef = useRef(null);
  const heartbeatInFlightRef = useRef(false);
  const roomPollInFlightRef = useRef(false);
  const isSubmittingRef = useRef(false);
  const isLeavingRef = useRef(false);
  const queuedAtRef = useRef(null);
  const liveRoomRef = useRef(null);
  const serverClockOffsetRef = useRef(0);
  // Tracks which room.serverNow value the offset was last derived from, so we
  // only recompute the offset when a genuinely fresh server timestamp arrives
  // (see syncRoomClock below).
  const lastSyncedServerNowRef = useRef(null);

  const clearTransientLiveState = useCallback(() => {
    setTypingText('');
    setReplayFrames([]);
    setRaceResult(null);
    setRaceOver(false);
  }, [setRaceOver, setRaceResult, setReplayFrames, setTypingText]);

  const clearLiveTimers = useCallback(() => {
    window.clearTimeout(heartbeatTimerRef.current);
    heartbeatTimerRef.current = null;
    heartbeatPayloadRef.current = null;
  }, []);

  const buildRoomStandings = useCallback((room) => {
    if (!room?.players?.length) {
      return [];
    }

    const standings = room.players.map((player) => {
      const result = player?.result || null;
      return {
        userId: player.userId,
        username: player.username || 'Player',
        wpm: Number(result?.wpm ?? player?.currentWpm ?? 0),
        accuracy: Number(result?.accuracy ?? player?.currentAccuracy ?? 0),
        finishedAtTs: Number(result?.finishedAtTs ?? 0),
        submitted: Boolean(result),
        isWinner: String(player.userId) === String(room?.winnerUserId),
        isCurrentUser: String(player.userId) === String(currentUser?.id),
      };
    });

    standings.sort((left, right) => {
      if (left.submitted !== right.submitted) {
        return left.submitted ? -1 : 1;
      }
      if (right.wpm !== left.wpm) {
        return right.wpm - left.wpm;
      }
      if (right.accuracy !== left.accuracy) {
        return right.accuracy - left.accuracy;
      }
      if (left.finishedAtTs && right.finishedAtTs && left.finishedAtTs !== right.finishedAtTs) {
        return left.finishedAtTs - right.finishedAtTs;
      }
      return String(left.username).localeCompare(String(right.username));
    });

    return standings.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
  }, [currentUser?.id]);

  const buildRoomResultPayload = useCallback((room) => {
    if (!room) {
      return null;
    }

    const standings = buildRoomStandings(room);
    const myStanding = standings.find((entry) => entry.isCurrentUser) || null;
    const myResult =
      room.players?.find((player) => String(player.userId) === String(currentUser?.id))?.result ||
      myStanding ||
      null;

    const currentTypingText = typingTextRef.current;
    const currentTimeLeft = timeLeftRef.current;
    const currentReplayFrames = replayFramesRef.current;
    const fallbackWpm = calculateWPM(currentTypingText, Math.max(1, duration - currentTimeLeft));
    const fallbackAccuracy = calculateAccuracy(
      room?.text || generatedContentPassage || getModeDescription(mode),
      currentTypingText
    );

    return {
      id: room.id || generateRaceId(),
      wpm: Number(myResult?.wpm ?? fallbackWpm),
      accuracy: Number(myResult?.accuracy ?? fallbackAccuracy),
      duration: Number(room.duration || duration),
      mode: room.mode || mode,
      language: room.language || language,
      netWPM: Math.max(
        0,
        Math.round(
          (Number(myResult?.wpm ?? fallbackWpm) * (Number(myResult?.accuracy ?? fallbackAccuracy) / 100)) * 10
        ) / 10
      ),
      coachTip:
        Number(myResult?.accuracy ?? fallbackAccuracy) < 92
          ? 'Accuracy dipped. Try smoother keystrokes and avoid forcing speed.'
          : 'Strong run. Keep your rhythm and push for a faster opening burst.',
      replayFrames: currentReplayFrames,
      shareText: `I typed ${Math.round(Number(myResult?.wpm ?? fallbackWpm))} WPM on TypeArena.`,
      winnerPrize: Number(room?.winnerPrize || 0),
      completedAt: room?.completedAt || new Date().toISOString(),
      winnerUserId: room?.winnerUserId || null,
      winnerUsername:
        room?.winnerUsername ||
        standings.find((entry) => entry.isWinner)?.username ||
        '',
      standings,
    };
  }, [
    buildRoomStandings,
    currentUser?.id,
    duration,
    generatedContentPassage,
    getModeDescription,
    language,
    mode,
    replayFramesRef,
    timeLeftRef,
    typingTextRef,
  ]);

  const syncRoomClock = useCallback((room) => {
    if (!room?.startedAt) {
      setCountdownRemaining(Number(room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
      return;
    }

    const countdownSeconds = Number(room.countdown || LIVE_RACE_COUNTDOWN_FALLBACK);

    // Bug fix: this used to recompute serverClockOffsetRef from room.serverNow
    // on EVERY call, including the local 250ms interpolation ticks that pass in
    // the same already-seen room object (no new network data). Since room.serverNow
    // is frozen at fetch time but Date.now() keeps moving, that made the offset
    // drift further off with each tick and only snap back correct on the next poll —
    // a sawtooth that differs per-client, so the two players' countdowns visibly
    // disagreed. Now we only re-derive the offset when a genuinely new serverNow
    // shows up (i.e. this room object came from a fresh server response).
    if (room.serverNow && room.serverNow !== lastSyncedServerNowRef.current) {
      const serverNowMs = Date.parse(room.serverNow);
      if (Number.isFinite(serverNowMs)) {
        serverClockOffsetRef.current = serverNowMs - Date.now();
        lastSyncedServerNowRef.current = room.serverNow;
      }
    }

    const startedAtMs = new Date(room.startedAt).getTime();
    if (!Number.isFinite(startedAtMs) || startedAtMs <= 0) {
      setCountdownRemaining(countdownSeconds);
      return;
    }

    const elapsedSeconds = Math.max(0, (Date.now() + serverClockOffsetRef.current - startedAtMs) / 1000);
    const remainingCountdown = Math.max(0, Math.ceil(countdownSeconds - elapsedSeconds));
    const raceElapsed = Math.max(0, Math.floor(elapsedSeconds - countdownSeconds));

    setCountdownRemaining(remainingCountdown);
    setTimeLeft(Math.max(0, Number(room.duration || duration) - raceElapsed));
  }, [duration, setTimeLeft]);

  const finalizeRoomIfCompleted = useCallback((room) => {
    if (room?.status !== 'completed') {
      return false;
    }

    const finalPayload = buildRoomResultPayload(room);
    if (finalPayload) {
      persistLatestRaceResult(finalPayload);
      setRaceResult(finalPayload);
    }
    setPhase('results');
    return true;
  }, [buildRoomResultPayload, persistLatestRaceResult, setPhase, setRaceResult]);

  const flushLiveHeartbeat = useCallback(async () => {
    if (!liveRoomRef.current?.id || heartbeatInFlightRef.current || !heartbeatPayloadRef.current) {
      return;
    }

    heartbeatInFlightRef.current = true;
    const payload = heartbeatPayloadRef.current;
    heartbeatPayloadRef.current = null;

    try {
      const room = await updateLiveRaceHeartbeat(liveRoomRef.current.id, payload);
      if (isLeavingRef.current) {
        return;
      }
      setLiveRoom(room);
      finalizeRoomIfCompleted(room);
    } catch (error) {
      console.error('Live heartbeat error:', error);
    } finally {
      heartbeatInFlightRef.current = false;
      if (heartbeatPayloadRef.current) {
        window.clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = window.setTimeout(() => {
          flushLiveHeartbeat();
        }, 120);
      }
    }
  }, [finalizeRoomIfCompleted]);

  const startQueuedRoom = useCallback((room, nextNotice, nextMode = mode, nextLanguage = language) => {
    setLiveRoom(room);
    recordUsedContentId(
      room?.contentId,
      room?.mode || nextMode,
      room?.language || nextLanguage,
      room?.totalContentCount || 0
    );
    clearTransientLiveState();
    setPhase('queued');
    queuedAtRef.current = Date.now();
    setQueueElapsed(0);
    setCountdownRemaining(Number(room?.countdown || LIVE_RACE_COUNTDOWN_FALLBACK));
    setTimeLeft(Number(room?.duration || duration));
    showNotice(nextNotice.message, nextNotice.type);
  }, [
    clearTransientLiveState,
    duration,
    language,
    mode,
    recordUsedContentId,
    setPhase,
    setTimeLeft,
    showNotice,
  ]);

  const startLiveRace = useCallback(async () => {
    if (currentUser === undefined) return;
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setLoadingLive(true);
    setLiveAction('matching');
    showNotice(null);

    try {
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        winnerPrize: Math.round((duration / 60) * 150),
        excludeContentIds: getUsedContentIds(mode, language),
        tournamentId: tournamentId || undefined,
        wpmMin: wpmFilter.min > 0 ? wpmFilter.min : undefined,
        wpmMax: wpmFilter.max < 300 ? wpmFilter.max : undefined,
      });

      startQueuedRoom(
        {
          ...response.room,
          totalContentCount: response.totalContentCount || 0,
        },
        {
          message: response.matched ? 'Opponent found. Countdown started.' : 'Waiting for another player…',
          type: response.matched ? 'success' : 'info',
        }
      );
      refreshFeed();
    } catch (error) {
      showNotice(error.message || 'Could not join a live race.', 'error');
    } finally {
      setLoadingLive(false);
      setLiveAction(null);
    }
  }, [
    currentUser,
    duration,
    getUsedContentIds,
    language,
    mode,
    redirectToProfile,
    refreshFeed,
    showNotice,
    startQueuedRoom,
    tournamentId,
    wpmFilter.max,
    wpmFilter.min,
  ]);

  const createFriendBattle = useCallback(async () => {
    if (currentUser === undefined) return;
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setLiveRoom(null);
    setLoadingLive(true);
    setLiveAction('creating');
    showNotice(null);

    try {
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        isPrivate: true,
        inviteCode: friendBattle.customInviteCode.trim(),
        password: friendBattle.password,
        excludeContentIds: getUsedContentIds(mode, language),
      });

      if (!response?.room) {
        throw new Error('Server response missing room details.');
      }

      startQueuedRoom(
        {
          ...response.room,
          totalContentCount: response.totalContentCount || 0,
        },
        {
          message: `Private room created. Waiting for your opponent to join with invite code ${response.room.inviteCode}.`,
          type: 'success',
        }
      );
      setFriendBattle((prev) => ({ ...prev, inviteCode: response.room.inviteCode || '' }));
      refreshFeed();
    } catch (error) {
      console.error('Error creating friend battle:', error);
      setPhase('lobby');
      showNotice(error.message || 'Could not create friend battle.', 'error');
    } finally {
      setLoadingLive(false);
      setLiveAction(null);
    }
  }, [
    currentUser,
    duration,
    friendBattle.customInviteCode,
    friendBattle.password,
    getUsedContentIds,
    language,
    mode,
    redirectToProfile,
    refreshFeed,
    setFriendBattle,
    setPhase,
    showNotice,
    startQueuedRoom,
  ]);

  const joinFriendBattle = useCallback(async () => {
    if (currentUser === undefined) return;
    if (!currentUser?.id) {
      redirectToProfile();
      return;
    }

    isLeavingRef.current = false;
    isSubmittingRef.current = false;
    setLoadingLive(true);
    setLiveAction('joining');
    showNotice(null);

    try {
      const response = await queueLiveRace({
        inviteCode: friendBattle.inviteCode.trim(),
        password: friendBattle.password,
      });

      setMode(response.room.mode || mode);
      setLanguage(response.room.language || language);
      setDuration(Number(response.room.duration || duration));
      startQueuedRoom(
        {
          ...response.room,
          totalContentCount: response.totalContentCount || 0,
        },
        {
          message: response.message || (
            response.matched
              ? 'Joined successfully. Opponent connected — race is starting.'
              : 'Joined successfully. Waiting for the host to start.'
          ),
          type: response.matched ? 'success' : 'info',
        },
        response.room.mode || mode,
        response.room.language || language
      );
      refreshFeed();
    } catch (error) {
      const inviteCode = friendBattle.inviteCode.trim().toUpperCase();
      const redirectParams = new URLSearchParams();
      if (inviteCode) redirectParams.set('invite', inviteCode);
      if (friendBattle.password) redirectParams.set('password', friendBattle.password);
      const redirectPath = `/play${redirectParams.toString() ? `?${redirectParams.toString()}` : ''}`;
      const message = error.message || 'Could not join friend battle.';

      if (/unauthorized|sign in/i.test(message)) {
        showNotice('Please sign in first. Taking you to your profile.', 'info');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
      } else if (/insufficient funds|need kes/i.test(message)) {
        showNotice('Top up your wallet to join this room. Taking you to your profile.', 'warning');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}&topup=1`);
      } else {
        showNotice(message, 'error');
      }
    } finally {
      setLoadingLive(false);
      setLiveAction(null);
    }
  }, [
    currentUser,
    duration,
    friendBattle.inviteCode,
    friendBattle.password,
    language,
    mode,
    navigate,
    redirectToProfile,
    refreshFeed,
    setDuration,
    setLanguage,
    setMode,
    showNotice,
    startQueuedRoom,
  ]);

  const requestRematch = useCallback(() => {
    setPendingRematch(true);
  }, []);

  const submitHeartbeat = useCallback(({ progress, currentWpm, currentAccuracy }) => {
    if (!liveRoomRef.current?.id) {
      return;
    }

    heartbeatPayloadRef.current = { progress, currentWpm, currentAccuracy };
    if (!heartbeatTimerRef.current) {
      heartbeatTimerRef.current = window.setTimeout(() => {
        heartbeatTimerRef.current = null;
        flushLiveHeartbeat();
      }, 1200);
    }
  }, [flushLiveHeartbeat]);

  const submitFinalLiveResult = useCallback(async ({ wpm, accuracy, finalData }) => {
    if (!liveRoomRef.current?.id) {
      return false;
    }

    try {
      const updatedRoom = await submitLiveRaceResult(liveRoomRef.current.id, { wpm, accuracy });
      if (isLeavingRef.current) {
        return true;
      }

      if (updatedRoom?.id) {
        setLiveRoom(updatedRoom);
      }

      const roomCompleted = updatedRoom?.status === 'completed';
      if (!roomCompleted) {
        // Stay on an intermediate waiting screen until the backend has winner
        // metadata and final standings for every participant.
        setRaceResult(null);
        setPhase('waiting');
        return true;
      }

      const freshPayload = updatedRoom?.id ? buildRoomResultPayload(updatedRoom) : null;
      const fallbackPayload = freshPayload || {
        ...finalData,
        netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
        coachTip: accuracy < 92 ? 'Accuracy dipped. Try smoother keystrokes.' : 'Strong run. Keep your rhythm.',
        replayFrames: replayFramesRef.current,
        shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
        completedAt: new Date().toISOString(),
        standings: [],
      };

      persistLatestRaceResult(fallbackPayload);
      setRaceResult(fallbackPayload);
      setPhase('results');
    } catch (error) {
      if (isLeavingRef.current) {
        return true;
      }
      if (error.message?.includes('1062')) {
        setRaceResult(null);
        setPhase('waiting');
      } else {
        console.error('Live race submit error:', error);
        const fallbackPayload = {
          ...finalData,
          netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
          coachTip: accuracy < 92 ? 'Accuracy dipped.' : 'Strong run.',
          replayFrames: replayFramesRef.current,
          shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
          completedAt: new Date().toISOString(),
          standings: [],
        };
        persistLatestRaceResult(fallbackPayload);
        setRaceResult(fallbackPayload);
        setPhase('results');
      }
    }

    return true;
  }, [buildRoomResultPayload, persistLatestRaceResult, replayFramesRef, setPhase, setRaceResult]);

  const leaveLiveRoomAndReset = useCallback(async () => {
    if (!liveRoomRef.current?.id) {
      return;
    }

    // Bug fix: this used to be private-room-only. The public "Leave Queue" flow
    // previously called nothing on the server at all, so a room a player queued
    // into stayed 'waiting' in the DB forever - a later player could match into
    // it and end up racing a "ghost" opponent who had already left. The backend
    // now accepts cancel requests for public waiting rooms too (as long as no
    // opponent has joined yet), so route both flows through the same call.
    isLeavingRef.current = true;
    setLoadingLive(true);
    try {
      const result = await cancelLiveRaceRoom(liveRoomRef.current.id);
      showNotice(result.message || 'Left the room.', 'info');
    } catch (error) {
      // If someone already joined between the click and this request landing,
      // the backend rejects the cancel - that's fine, we still leave locally
      // and let the room continue without us rather than surfacing a dead end.
      showNotice(error.message || 'Could not leave the room.', 'error');
    } finally {
      clearLiveTimers();
      setLiveRoom(null);
      clearTransientLiveState();
      setQueueElapsed(0);
      queuedAtRef.current = null;
      setPhase('lobby');
      setLoadingLive(false);
      refreshFeed();
    }
  }, [clearLiveTimers, clearTransientLiveState, refreshFeed, setPhase, showNotice]);

  const resetLiveSession = useCallback(() => {
    isLeavingRef.current = true;
    isSubmittingRef.current = false;
    clearLiveTimers();
    setLiveRoom(null);
    setLoadingLive(false);
    setCountdownRemaining(LIVE_RACE_COUNTDOWN_FALLBACK);
    setQueueElapsed(0);
    queuedAtRef.current = null;
    setPendingRematch(false);
  }, [clearLiveTimers]);

  useEffect(() => {
    liveRoomRef.current = liveRoom;
  }, [liveRoom]);

  useEffect(() => {
    if (!liveRoom?.id || phase === 'lobby') {
      return undefined;
    }

    const roomId = liveRoom.id;
    if (phase === 'results') {
      const allDone = liveRoom?.players?.every((player) => Boolean(player?.result));
      if (allDone) {
        return undefined;
      }
    }

    const interval = window.setInterval(async () => {
      if (document.visibilityState !== 'visible' || roomPollInFlightRef.current) {
        return;
      }

      roomPollInFlightRef.current = true;
      try {
        const room = await fetchLiveRaceRoom(roomId);
        if (isLeavingRef.current) {
          return;
        }
        setLiveRoom(room);
        if (finalizeRoomIfCompleted(room) || phase === 'results') {
          return;
        }
        syncRoomClock(room);
        if (phase === 'queued' && room.status === 'racing') {
          setPhase('racing');
          window.setTimeout(() => inputRef.current?.focus(), 150);
        }
      } catch (error) {
        console.error('Live room polling error:', error);
      } finally {
        roomPollInFlightRef.current = false;
      }
    }, phase === 'queued'
      ? LIVE_ROOM_POLL_QUEUED_MS
      : phase === 'results'
        ? LIVE_ROOM_POLL_RESULTS_MS
        : LIVE_ROOM_POLL_ACTIVE_MS);

    return () => window.clearInterval(interval);
  // Keep the polling interval stable; the latest room/player state is read through refs in callbacks.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalizeRoomIfCompleted, inputRef, liveRoom?.id, phase, setPhase, syncRoomClock]);

  useEffect(() => {
    if (phase === 'queued' && liveRoom?.status === 'countdown') {
      showNotice(`Race starts in ${Math.max(0, countdownRemaining)} seconds…`, 'info');
      if (countdownRemaining <= 0) {
        setPhase('racing');
        window.setTimeout(() => inputRef.current?.focus(), 150);
      }
    }
  }, [countdownRemaining, inputRef, liveRoom?.status, phase, setPhase, showNotice]);

  useEffect(() => {
    if (phase !== 'queued') {
      setQueueElapsed(0);
      queuedAtRef.current = null;
      return undefined;
    }

    if (!queuedAtRef.current) {
      queuedAtRef.current = Date.now();
    }

    const interval = window.setInterval(() => {
      setQueueElapsed(Math.floor((Date.now() - (queuedAtRef.current || Date.now())) / 1000));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (
      liveRoom?.status === 'completed' &&
      phase !== 'results' &&
      phase !== 'lobby' &&
      !isLeavingRef.current
    ) {
      finalizeRoomIfCompleted(liveRoom);
      return;
    }

    if (phase === 'queued' && liveRoom?.status === 'countdown') {
      syncRoomClock(liveRoom);
      const countdownTimer = window.setInterval(() => {
        syncRoomClock(liveRoomRef.current);
      }, LIVE_CLOCK_SYNC_INTERVAL_MS);
      return () => window.clearInterval(countdownTimer);
    }

    return undefined;
  }, [finalizeRoomIfCompleted, liveRoom, phase, syncRoomClock]);

  useEffect(() => {
    if (!pendingRematch || phase !== 'lobby') {
      return;
    }
    setPendingRematch(false);
    joinFriendBattle();
  }, [joinFriendBattle, pendingRematch, phase]);

  useEffect(() => () => {
    clearLiveTimers();
  }, [clearLiveTimers]);

  const myPlayer = currentUser?.id
    ? (liveRoom?.players?.find((player) => String(player.userId) === String(currentUser.id)) ?? null)
    : null;
  const opponent = liveRoom?.players?.find((player) => player.userId !== myPlayer?.userId) || null;

  return {
    liveRoom,
    setLiveRoom,
    liveRoomRef,
    serverClockOffsetRef,
    loadingLive,
    liveAction,
    countdownRemaining,
    queueElapsed,
    pendingRematch,
    setPendingRematch,
    isSubmittingRef,
    isLeavingRef,
    syncRoomClock,
    buildRoomResultPayload,
    startLiveRace,
    createFriendBattle,
    joinFriendBattle,
    requestRematch,
    cancelPrivateRoom: leaveLiveRoomAndReset,
    leaveLiveRoom: leaveLiveRoomAndReset,
    submitHeartbeat,
    submitFinalLiveResult,
    resetLiveSession,
    myPlayer,
    opponent,
  };
}