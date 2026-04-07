import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  calculateAccuracy,
  calculateWPM,
  formatTime,
  generateRaceId,
} from '../utils/typingEngine';
import {
  cancelLiveRaceRoom,
  generateRaceContent,
  fetchLiveRaceByInvite,
  fetchLiveRaceRoom,
  fetchLiveRaces,
  queueLiveRace,
  submitLiveRaceResult,
  submitRaceResult,
  updateLiveRaceHeartbeat,
} from '../utils/typingApi';
import '../styles/Play.css';

const MODE_CONFIG = [
  { id: 'standard', label: '1v1 Battle', description: 'Classic live duel with balanced pacing.' },
  { id: 'survival', label: 'Survival', description: 'Stay accurate under pressure.' },
  { id: 'speed_burst', label: 'Speed Burst', description: 'Short explosive sprints.' },
  { id: 'code', label: 'Code Syntax', description: 'Battle with developer-friendly text.' },
  { id: 'memory', label: 'Memory', description: 'Preview the prompt then reproduce it fast.' },
  { id: 'quote', label: 'Quote', description: 'Premium quote typing rounds.' },
  { id: 'marathon', label: 'Marathon', description: 'Long-form endurance mode.' },
];

export default function Play() {
  const location = useLocation();
  const navigate = useNavigate();
  const [phase, setPhase] = useState('lobby');
  const [mode, setMode] = useState('standard');
  const [language, setLanguage] = useState('english');
  const [duration, setDuration] = useState(60);
  const [liveFeed, setLiveFeed] = useState([]);
  const [liveRoom, setLiveRoom] = useState(null);
  const [typingText, setTypingText] = useState('');
  const [timeLeft, setTimeLeft] = useState(60);
  const [loadingLive, setLoadingLive] = useState(false);
  const [notice, setNotice] = useState('');
  const [raceResult, setRaceResult] = useState(null);
  const [generatedContent, setGeneratedContent] = useState(null);
  const [replayFrames, setReplayFrames] = useState([]);
  const [friendBattle, setFriendBattle] = useState({
    inviteCode: '',
    password: '',
  });
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteCode = (params.get('invite') || '').trim().toUpperCase();
    const password = params.get('password') || '';

    if (!inviteCode) {
      return;
    }

    setFriendBattle((prev) => ({
      ...prev,
      inviteCode,
      password: password || prev.password,
    }));

    const storedUser = localStorage.getItem('typearena_user');
    setNotice(
      storedUser
        ? `Invite loaded. Enter the room with code ${inviteCode} when you are ready.`
        : `Invite loaded. Sign in first, then join room ${inviteCode}.`
    );
  }, [location.search]);

  useEffect(() => {
    const loadGeneratedContent = async () => {
      const content = await generateRaceContent(mode, language);
      setGeneratedContent(content);
    };
    loadGeneratedContent();
  }, [language, mode]);

  const finishRace = useCallback(async () => {
    const elapsed = Math.max(1, duration - timeLeft);
    const sourceText =
      liveRoom?.text ||
      generatedContent?.passage ||
      MODE_CONFIG.find((item) => item.id === mode)?.description ||
      '';
    const wpm = calculateWPM(typingText, elapsed);
    const accuracy = calculateAccuracy(sourceText, typingText);
    const finalData = {
      id: generateRaceId(),
      wpm,
      accuracy,
      duration,
      mode,
      language,
    };

    try {
      await submitRaceResult(finalData);
    } catch (error) {
      console.error('Practice race submit error:', error);
    }

    if (liveRoom?.id) {
      try {
        const room = await submitLiveRaceResult(liveRoom.id, { wpm, accuracy });
        setLiveRoom(room);
      } catch (error) {
        console.error('Live race submit error:', error);
      }
    }

    setRaceResult({
      ...finalData,
      netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
      coachTip:
        accuracy < 92
          ? 'Accuracy dipped. Try smoother keystrokes and avoid forcing speed.'
          : 'Strong run. Keep your rhythm and push for a faster opening burst.',
      replayFrames,
      shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
    });
    setPhase('results');
  }, [duration, generatedContent, language, liveRoom, mode, replayFrames, timeLeft, typingText]);

  useEffect(() => {
    const loadFeed = async () => {
      const rooms = await fetchLiveRaces().catch(() => []);
      setLiveFeed(Array.isArray(rooms) ? rooms : []);
    };
    loadFeed();
    const interval = window.setInterval(loadFeed, 4000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!liveRoom?.id || (phase !== 'queued' && phase !== 'racing' && phase !== 'results')) {
      return undefined;
    }

    const interval = window.setInterval(async () => {
      try {
        const room = await fetchLiveRaceRoom(liveRoom.id);
        setLiveRoom(room);
        if (phase === 'queued' && room.status !== 'waiting') {
          setPhase('racing');
          setTimeLeft(Number(room.duration || duration));
          setTimeout(() => inputRef.current?.focus(), 150);
        }
      } catch (error) {
        console.error('Live room polling error:', error);
      }
    }, 1200);

    return () => window.clearInterval(interval);
  }, [duration, liveRoom, phase]);

  useEffect(() => {
    if (phase !== 'racing') {
      window.clearInterval(timerRef.current);
      return undefined;
    }

    timerRef.current = window.setInterval(() => {
      setTimeLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timerRef.current);
          finishRace();
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timerRef.current);
  }, [finishRace, phase]);

  const refreshFeed = async () => {
    const rooms = await fetchLiveRaces().catch(() => []);
    setLiveFeed(Array.isArray(rooms) ? rooms : []);
  };

  const startPracticeRace = () => {
    setLiveRoom(null);
    setTypingText('');
    setReplayFrames([]);
    setRaceResult(null);
    setNotice('');
    setTimeLeft(duration);
    setPhase('racing');
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const startLiveRace = async () => {
    setLoadingLive(true);
    setNotice('');
    try {
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        winnerPrize: Math.round((duration / 60) * 150),
      });
      setLiveRoom(response.room);
      setTypingText('');
      setReplayFrames([]);
      setRaceResult(null);
      setPhase(response.matched ? 'racing' : 'queued');
      setTimeLeft(Number(response.room?.duration || duration));
      setNotice(response.matched ? 'Opponent found. Countdown started.' : 'Waiting for another player...');
      if (response.matched) {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
      refreshFeed();
    } catch (error) {
      setNotice(error.message || 'Could not join a live race.');
    } finally {
      setLoadingLive(false);
    }
  };

  const createFriendBattle = async () => {
    setLoadingLive(true);
    setNotice('');
    try {
      const response = await queueLiveRace({
        mode,
        language,
        duration,
        isPrivate: true,
        password: friendBattle.password,
      });
      setLiveRoom(response.room);
      setTypingText('');
      setReplayFrames([]);
      setRaceResult(null);
      setPhase('queued');
      setTimeLeft(Number(response.room?.duration || duration));
      setFriendBattle((prev) => ({ ...prev, inviteCode: response.room.inviteCode || '' }));
      setNotice(
        response.message || `Private room created. Share invite code ${response.room.inviteCode} with your opponent so they can join.`
      );
      refreshFeed();
    } catch (error) {
      setNotice(error.message || 'Could not create friend battle.');
    } finally {
      setLoadingLive(false);
    }
  };

  const joinFriendBattle = async () => {
    setLoadingLive(true);
    setNotice('');
    try {
      const roomPreview = await fetchLiveRaceByInvite(friendBattle.inviteCode.trim());
      const response = await queueLiveRace({
        inviteCode: roomPreview.inviteCode || friendBattle.inviteCode.trim(),
        password: friendBattle.password,
      });
      setLiveRoom(response.room);
      setTypingText('');
      setRaceResult(null);
      setMode(response.room.mode || mode);
      setLanguage(response.room.language || language);
      setDuration(Number(response.room.duration || duration));
      setPhase(response.matched ? 'racing' : 'queued');
      setTimeLeft(Number(response.room?.duration || duration));
      setNotice(
        response.message || (
          response.matched
            ? 'Joined successfully. Opponent connected and the race is starting now.'
            : 'Joined successfully. Waiting for the host to start the match.'
        )
      );
      if (response.matched) {
        setTimeout(() => inputRef.current?.focus(), 150);
      }
      refreshFeed();
    } catch (error) {
      const inviteCode = friendBattle.inviteCode.trim().toUpperCase();
      const redirectParams = new URLSearchParams();
      if (inviteCode) {
        redirectParams.set('invite', inviteCode);
      }
      if (friendBattle.password) {
        redirectParams.set('password', friendBattle.password);
      }
      const redirectPath = `/play${redirectParams.toString() ? `?${redirectParams.toString()}` : ''}`;
      const message = error.message || 'Could not join friend battle.';

      if (/unauthorized|sign in/i.test(message)) {
        setNotice('Please sign in first. We are taking you to your profile, then back to this room.');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}`);
      } else if (/insufficient funds|need kes/i.test(message)) {
        setNotice('You need to top up your wallet before joining this room. We are taking you to your profile.');
        navigate(`/profile?redirect=${encodeURIComponent(redirectPath)}&topup=1`);
      } else {
        setNotice(message);
      }
    } finally {
      setLoadingLive(false);
    }
  };

  const shareToWhatsApp = () => {
    if (!liveRoom?.inviteCode && !friendBattle.inviteCode) {
      return;
    }
    const inviteCode = liveRoom?.inviteCode || friendBattle.inviteCode;
    const roomPassword = liveRoom?.password || friendBattle.password;
    const inviteLink = `https://faithmutheu1.alwaysdata.net/play?invite=${encodeURIComponent(inviteCode)}${roomPassword ? `&password=${encodeURIComponent(roomPassword)}` : ''}`;
    const parts = [
      'Join my TypeArena friend battle.',
      `Invite code: ${inviteCode}`,
      roomPassword ? `Password: ${roomPassword}` : '',
      `Open: ${inviteLink}`,
    ].filter(Boolean);
    const message = parts.join(' ');
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const cancelPrivateRoom = async () => {
    if (!liveRoom?.id) {
      return;
    }
    setLoadingLive(true);
    try {
      const result = await cancelLiveRaceRoom(liveRoom.id);
      setNotice(result.message || 'Private room canceled.');
      setLiveRoom(null);
      setPhase('lobby');
      await refreshFeed();
    } catch (error) {
      setNotice(error.message || 'Could not cancel private room.');
    } finally {
      setLoadingLive(false);
    }
  };

  const handleInputChange = async (event) => {
    const value = event.target.value;
    setTypingText(value);
    setReplayFrames((prev) => [
      ...prev.slice(-11),
      { typedText: value, timestamp: new Date().toISOString() },
    ]);
    if (liveRoom?.id) {
      const sourceTextLength = Math.max(1, (liveRoom.text || '').length);
      const progress = Math.min(100, Math.round((value.length / sourceTextLength) * 100));
      const currentWpm = calculateWPM(value, Math.max(1, duration - timeLeft));
      try {
        const room = await updateLiveRaceHeartbeat(liveRoom.id, { progress, currentWpm });
        setLiveRoom(room);
      } catch (error) {
        console.error('Live heartbeat error:', error);
      }
    }
  };

  const myPlayer = liveRoom?.players?.[0];
  const opponent = liveRoom?.players?.find((player) => player.userId !== myPlayer?.userId);
  const exportScoreCard = () => {
    if (!raceResult) return;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
        <rect width="100%" height="100%" fill="#0e131a" />
        <text x="80" y="150" fill="#f5f5f5" font-size="68" font-family="Arial">TypeArena Share Card</text>
        <text x="80" y="320" fill="#22c55e" font-size="128" font-family="Arial" font-weight="700">${Math.round(raceResult.wpm)} WPM</text>
        <text x="80" y="430" fill="#f5f5f5" font-size="54" font-family="Arial">${Number(raceResult.accuracy).toFixed(1)}% accuracy</text>
        <text x="80" y="540" fill="#facc15" font-size="48" font-family="Arial">${raceResult.shareText}</text>
      </svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `typearena-share-card-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="play-container">
      {phase === 'lobby' && (
        <div className="mode-select">
          <h1>Live Premium Typing Arena</h1>

          <div className="challenge-toolbar">
            <h2>Choose a premium race mode</h2>
            <div className="challenge-toolbar__actions">
              <div className="duration-switch">
                {[30, 60, 120].map((item) => (
                  <button
                    key={item}
                    className={`duration-switch__btn ${duration === item ? 'active' : ''}`}
                    onClick={() => setDuration(item)}
                  >
                    {item}s
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="challenge-grid">
            {MODE_CONFIG.map((item) => (
              <button
                key={item.id}
                className={`challenge-card ${mode === item.id ? 'active' : ''}`}
                onClick={() => setMode(item.id)}
              >
                <div className="challenge-card__top">
                  <h3>{item.label}</h3>
                  <span className="challenge-difficulty">{language}</span>
                </div>
                <p>{generatedContent?.title && mode === item.id ? generatedContent.passage : item.description}</p>
                <div className="challenge-meta">
                  <span>{duration}s</span>
                  <span>{generatedContent?.antiCheatHint && mode === item.id ? 'AI Generated' : 'Live + Practice'}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="results-actions">
            <button className="btn btn-outline-primary" onClick={startPracticeRace}>
              Start Practice
            </button>
            <button className="btn btn-primary" onClick={startLiveRace} disabled={loadingLive}>
              {loadingLive ? 'Joining Live Room...' : 'Join Live 1v1'}
            </button>
          </div>

          <div className="friend-battle-card">
            <div className="live-board__header">
              <h2>Friend Battles + Private Rooms</h2>
            </div>
            <div className="friend-battle-grid">
              <input
                value={friendBattle.inviteCode}
                onChange={(event) =>
                  setFriendBattle((prev) => ({ ...prev, inviteCode: event.target.value.toUpperCase() }))
                }
                placeholder="Invite code"
              />
              <input
                value={friendBattle.password}
                onChange={(event) =>
                  setFriendBattle((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="Private room password"
              />
            </div>
            <div className="results-actions">
              <button className="btn btn-primary" onClick={createFriendBattle} disabled={loadingLive}>
                Create Private Room
              </button>
              <button className="btn btn-outline-primary" onClick={joinFriendBattle} disabled={loadingLive || !friendBattle.inviteCode.trim()}>
                Join With Invite
              </button>
              <button className="btn btn-success" onClick={shareToWhatsApp} disabled={!liveRoom?.inviteCode && !friendBattle.inviteCode}>
                Share on WhatsApp
              </button>
            </div>
            <p className="results-challenge">
              Invite code and private password work here for free private matches.
            </p>
          </div>

          {notice && <p className="results-challenge">{notice}</p>}

          <div className="live-board">
            <div className="live-board__header">
              <h2>Live Spectator Feed</h2>
              <button className="btn btn-sm btn-outline-light" onClick={refreshFeed}>
                Refresh
              </button>
            </div>
            <div className="live-board__grid">
              {liveFeed.slice(0, 6).map((room) => (
                <div key={room.id} className="result-card live-card">
                  <span className="result-label">{room.mode}</span>
                  <span className="result-value">{room.status}</span>
                  <p>
                    {room.players?.length || 0}/2 players • {room.spectators || 0} spectators
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {phase === 'queued' && (
        <div className="race-results">
          <h1>Queued for Live Race</h1>
          <p className="results-challenge">{notice || 'Waiting for an opponent to join your room.'}</p>
          {(liveRoom?.inviteCode || friendBattle.inviteCode) && (
            <p className="results-challenge">Invite code: {liveRoom?.inviteCode || friendBattle.inviteCode}</p>
          )}
            <div className="results-actions">
              <button className="btn btn-success" onClick={shareToWhatsApp}>
                Share on WhatsApp
              </button>
              {liveRoom?.isPrivate && (
                <button className="btn btn-outline-danger" onClick={cancelPrivateRoom} disabled={loadingLive}>
                  {loadingLive ? 'Canceling Room...' : 'Cancel Room'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => setPhase('lobby')}>
                Back to Lobby
              </button>
            </div>
        </div>
      )}

      {phase === 'racing' && (
        <div className="race-arena">
          <div className="race-header">
            <div className="stats">
              <div className="stat">
                <span className="stat-label">Mode</span>
                <span className="stat-value live-mode">{mode}</span>
              </div>
              <div className="stat">
                <span className="stat-label">Language</span>
                <span className="stat-value live-mode">{language}</span>
              </div>
              <div className="timer">
                <span className={`time ${timeLeft <= 10 ? 'danger' : ''}`}>{formatTime(timeLeft)}</span>
              </div>
            </div>
          </div>

          {liveRoom && (
            <div className="opponent-panel">
              <div className="opponent-panel__item">
                <span>You</span>
                <strong>{myPlayer?.progress || 0}%</strong>
              </div>
              <div className="opponent-panel__item">
                <span>{opponent?.username || 'Opponent'}</span>
                <strong>{opponent?.progress || 0}%</strong>
              </div>
              <div className="opponent-panel__item">
                <span>Spectators</span>
                <strong>{liveRoom.spectators || 0}</strong>
              </div>
            </div>
          )}

          <div className="typing-area">
            <div className="display-text">
              {liveRoom?.text || generatedContent?.passage || 'Type fast, type clean, and own the round.'}
            </div>
            {!liveRoom?.text && generatedContent?.antiCheatHint && (
              <p className="results-challenge">{generatedContent.antiCheatHint}</p>
            )}
            <textarea
              ref={inputRef}
              className="typing-input"
              value={typingText}
              onChange={handleInputChange}
              placeholder="Start typing here..."
            />
          </div>

          <div className="results-actions">
            <button className="btn btn-danger" onClick={finishRace}>
              Finish Race
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && raceResult && (
        <div className="race-results">
          <h1>Race Complete</h1>
          <p className="results-challenge">
            {liveRoom?.winnerUserId
              ? `Winner: ${
                  liveRoom.players?.find((player) => player.userId === liveRoom.winnerUserId)?.username || 'Pending'
                }`
              : 'Results submitted.'}
          </p>

          <div className="results-grid">
            <div className="result-card">
              <span className="result-label">WPM</span>
              <span className="result-value">{Number(raceResult.wpm).toFixed(1)}</span>
            </div>
            <div className="result-card">
              <span className="result-label">Net WPM</span>
              <span className="result-value">{Number(raceResult.netWPM).toFixed(1)}</span>
            </div>
            <div className="result-card">
              <span className="result-label">Accuracy</span>
              <span className="result-value">{Number(raceResult.accuracy).toFixed(1)}%</span>
            </div>
            <div className="result-card">
              <span className="result-label">Winner Prize</span>
              <span className="result-value">
                KES {Number(liveRoom?.winnerPrize || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <p className="results-challenge">{raceResult.coachTip}</p>
          <div className="results-content-creator">
            <div className="result-card">
              <span className="result-label">Creator Hook</span>
              <p className="creator-copy">{raceResult.shareText}</p>
            </div>
            <div className="result-card">
              <span className="result-label">Replay Frames</span>
              <span className="result-value">{raceResult.replayFrames?.length || 0}</span>
            </div>
          </div>

          <div className="replay-strip">
            {(raceResult.replayFrames || []).slice(-5).map((frame, index) => (
              <div key={`${frame.timestamp}_${index}`} className="replay-frame">
                <span>Frame {index + 1}</span>
                <p>{frame.typedText.slice(-90) || 'Race start'}</p>
              </div>
            ))}
          </div>

          <div className="results-actions">
            <button className="btn btn-success" onClick={exportScoreCard}>
              Export Score Card
            </button>
            <button className="btn btn-primary" onClick={() => setPhase('lobby')}>
              Back to Lobby
            </button>
            <button className="btn btn-secondary" onClick={startPracticeRace}>
              Race Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
