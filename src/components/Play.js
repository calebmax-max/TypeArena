import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  calculateAccuracy,
  calculateWPM,
  formatTime,
  generateRaceId,
} from '../utils/typingEngine';
import {
  cancelLiveRaceRoom,
  fetchCurrentUser,
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

const LATEST_RACE_RESULT_KEY = 'typearena_latest_race_result';
const KEYBOARD_LAYOUT = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Backspace'],
  ['Tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['CapsLock', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', 'Shift'],
  ['Space'],
];

const THEME_PRESETS = {
  default: {
    label: 'Arena Default',
    style: {
      '--arena-bg': 'linear-gradient(150deg, hsl(240 12% 9% / 0.9), hsl(240 11% 12% / 0.95))',
      '--arena-panel': 'hsl(240 12% 7% / 0.72)',
      '--arena-panel-border': 'hsl(240 10% 19%)',
      '--arena-text': 'hsl(0 0% 95%)',
      '--arena-muted': 'hsl(240 5% 66%)',
      '--arena-accent': 'hsl(145 80% 42%)',
      '--arena-accent-soft': 'hsl(145 80% 42% / 0.2)',
      '--arena-glow': 'hsl(145 80% 42% / 0.25)',
      '--arena-gold': 'hsl(45 100% 68%)',
      '--arena-key-bg': 'linear-gradient(180deg, hsl(220 17% 18%), hsl(220 19% 10%))',
      '--arena-key-border': 'hsl(220 15% 28%)',
      '--arena-key-text': 'hsl(0 0% 95%)',
      '--arena-key-highlight': 'hsl(145 80% 42% / 0.28)',
      '--arena-surface': 'hsl(240 12% 6% / 0.82)',
    },
  },
  theme_nairobi_night: {
    label: 'Nairobi Night Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(8, 12, 24, 0.98), rgba(19, 45, 78, 0.96) 52%, rgba(10, 14, 24, 0.98))',
      '--arena-panel': 'rgba(13, 22, 38, 0.82)',
      '--arena-panel-border': 'rgba(72, 136, 255, 0.24)',
      '--arena-text': '#f5fbff',
      '--arena-muted': 'rgba(190, 213, 255, 0.72)',
      '--arena-accent': '#41d3ff',
      '--arena-accent-soft': 'rgba(65, 211, 255, 0.17)',
      '--arena-glow': 'rgba(65, 211, 255, 0.28)',
      '--arena-gold': '#ffd166',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(14, 26, 46, 0.95), rgba(6, 14, 26, 0.98))',
      '--arena-key-border': 'rgba(82, 164, 255, 0.25)',
      '--arena-key-text': '#f3f9ff',
      '--arena-key-highlight': 'rgba(65, 211, 255, 0.3)',
      '--arena-surface': 'rgba(8, 15, 29, 0.92)',
    },
  },
  theme_savanna_gold: {
    label: 'Savanna Gold Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(43, 28, 10, 0.98), rgba(113, 75, 20, 0.94) 50%, rgba(36, 24, 11, 0.98))',
      '--arena-panel': 'rgba(56, 37, 15, 0.8)',
      '--arena-panel-border': 'rgba(255, 198, 110, 0.22)',
      '--arena-text': '#fff9ec',
      '--arena-muted': 'rgba(244, 220, 174, 0.72)',
      '--arena-accent': '#ffb347',
      '--arena-accent-soft': 'rgba(255, 179, 71, 0.18)',
      '--arena-glow': 'rgba(255, 179, 71, 0.28)',
      '--arena-gold': '#ffe08a',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(80, 54, 20, 0.94), rgba(45, 29, 11, 0.98))',
      '--arena-key-border': 'rgba(255, 203, 114, 0.24)',
      '--arena-key-text': '#fff6df',
      '--arena-key-highlight': 'rgba(255, 179, 71, 0.28)',
      '--arena-surface': 'rgba(41, 27, 11, 0.92)',
    },
  },
  theme_stealth_hq: {
    label: 'Stealth HQ Theme',
    style: {
      '--arena-bg': 'linear-gradient(145deg, rgba(8, 9, 11, 0.99), rgba(28, 31, 36, 0.96) 46%, rgba(7, 7, 8, 0.99))',
      '--arena-panel': 'rgba(19, 21, 24, 0.84)',
      '--arena-panel-border': 'rgba(135, 149, 161, 0.2)',
      '--arena-text': '#f3f5f7',
      '--arena-muted': 'rgba(182, 191, 197, 0.72)',
      '--arena-accent': '#b6ff7b',
      '--arena-accent-soft': 'rgba(182, 255, 123, 0.16)',
      '--arena-glow': 'rgba(182, 255, 123, 0.22)',
      '--arena-gold': '#d3dae1',
      '--arena-key-bg': 'linear-gradient(180deg, rgba(28, 31, 35, 0.95), rgba(10, 11, 13, 0.98))',
      '--arena-key-border': 'rgba(145, 156, 168, 0.2)',
      '--arena-key-text': '#f5f7f8',
      '--arena-key-highlight': 'rgba(182, 255, 123, 0.24)',
      '--arena-surface': 'rgba(12, 13, 15, 0.94)',
    },
  },
};

const SKIN_PRESETS = {
  default: {},
  skin_velocity_black: {
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #20262f, #0f1319)',
      '--arena-key-border': '#3f4d61',
      '--arena-key-text': '#f8fbff',
      '--arena-key-shadow': 'rgba(4, 9, 15, 0.45)',
    },
  },
  skin_molten_copper: {
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #5c321a, #231107)',
      '--arena-key-border': '#d48a52',
      '--arena-key-text': '#fff2e6',
      '--arena-key-shadow': 'rgba(104, 48, 17, 0.38)',
    },
  },
  skin_frostline_pro: {
    style: {
      '--arena-key-bg': 'linear-gradient(180deg, #d6f0ff, #8ab6d5)',
      '--arena-key-border': '#eef8ff',
      '--arena-key-text': '#10273d',
      '--arena-key-shadow': 'rgba(143, 197, 232, 0.34)',
    },
  },
};

const AVATAR_PRESETS = {
  default: { mark: 'TA', title: 'TypeArena Avatar', aura: 'avatar-aura-default' },
  avatar_apex_panther: { mark: 'AP', title: 'Apex Panther', aura: 'avatar-aura-panther' },
  avatar_signal_ghost: { mark: 'SG', title: 'Signal Ghost', aura: 'avatar-aura-ghost' },
  avatar_crown_hawk: { mark: 'CH', title: 'Crown Hawk', aura: 'avatar-aura-hawk' },
};

const BADGE_PRESETS = {
  default: { label: 'Player' },
  badge_founders_mark: { label: 'Founder Mark' },
  badge_clutch_streak: { label: 'Clutch Streak' },
  badge_elite_verified: { label: 'Elite Verified' },
};

const FRAME_PRESETS = {
  default: 'frame-default',
  frame_titan_brass: 'frame-titan-brass',
  frame_carbonglass: 'frame-carbonglass',
  frame_imperial_crown: 'frame-imperial-crown',
};

const EFFECT_PRESETS = {
  default: 'effect-default',
  effect_reactor_sparks: 'effect-reactor-sparks',
  effect_afterburn_wave: 'effect-afterburn-wave',
  effect_royal_echo: 'effect-royal-echo',
};

const MODE_CONFIG = [
  { id: 'standard', label: '1v1 Battle', description: 'Classic live duel with balanced pacing.' },
  { id: 'survival', label: 'Survival', description: 'Stay accurate under pressure.' },
  { id: 'speed_burst', label: 'Speed Burst', description: 'Short explosive sprints.' },
  { id: 'code', label: 'Code Syntax', description: 'Battle with developer-friendly text.' },
  { id: 'memory', label: 'Memory', description: 'Preview the prompt then reproduce it fast.' },
  { id: 'quote', label: 'Quote', description: 'Premium quote typing rounds.' },
  { id: 'marathon', label: 'Marathon', description: 'Long-form endurance mode.' },
];

const normalizeKeyboardKey = (key) => {
  if (!key) return '';
  if (key === ' ') return 'Space';
  if (key === 'Esc') return 'Escape';
  if (key.length === 1) return key.toUpperCase();
  return key;
};

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
  const [currentUser, setCurrentUser] = useState(null);
  const [friendBattle, setFriendBattle] = useState({
    inviteCode: '',
    password: '',
    customInviteCode: '',
  });
  const inputRef = useRef(null);
  const timerRef = useRef(null);
  const [activeKeys, setActiveKeys] = useState([]);

  useEffect(() => {
    fetchCurrentUser().then(setCurrentUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (phase !== 'racing') {
      setActiveKeys([]);
      return undefined;
    }

    const handleWindowKeyDown = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) {
        return;
      }
      setActiveKeys((current) => (current.includes(normalized) ? current : [...current, normalized]));
    };

    const handleWindowKeyUp = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) {
        return;
      }
      setActiveKeys((current) => current.filter((item) => item !== normalized));
    };

    const handleWindowBlur = () => setActiveKeys([]);

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [phase]);

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
    const sourceText = liveRoom?.text || generatedContent?.passage || MODE_CONFIG.find((item) => item.id === mode)?.description || '';
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

    const resultPayload = {
      ...finalData,
      netWPM: Math.max(0, Math.round((wpm * (accuracy / 100)) * 10) / 10),
      coachTip:
        accuracy < 92
          ? 'Accuracy dipped. Try smoother keystrokes and avoid forcing speed.'
          : 'Strong run. Keep your rhythm and push for a faster opening burst.',
      replayFrames,
      shareText: `I typed ${Math.round(wpm)} WPM on TypeArena.`,
      winnerPrize: Number(liveRoom?.winnerPrize || 0),
      completedAt: new Date().toISOString(),
    };

    sessionStorage.setItem(LATEST_RACE_RESULT_KEY, JSON.stringify(resultPayload));
    setRaceResult(resultPayload);
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
        inviteCode: friendBattle.customInviteCode.trim(),
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
    const inviteLink = `${window.location.origin}/play?invite=${encodeURIComponent(inviteCode)}${roomPassword ? `&password=${encodeURIComponent(roomPassword)}` : ''}`;
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
  const hasSignatureInvites = Boolean(currentUser?.storePerks?.customInviteCodes);
  const equippedItems = currentUser?.equippedItems || {};
  const themePreset = THEME_PRESETS[equippedItems.theme] || THEME_PRESETS.default;
  const skinPreset = SKIN_PRESETS[equippedItems.skin] || SKIN_PRESETS.default;
  const avatarPreset = AVATAR_PRESETS[equippedItems.avatar] || AVATAR_PRESETS.default;
  const badgePreset = BADGE_PRESETS[equippedItems.badge] || BADGE_PRESETS.default;
  const frameClassName = FRAME_PRESETS[equippedItems.frame] || FRAME_PRESETS.default;
  const effectClassName = EFFECT_PRESETS[equippedItems.effect] || EFFECT_PRESETS.default;
  const arenaStyle = {
    ...themePreset.style,
    ...skinPreset.style,
  };
  const sourceText = liveRoom?.text || generatedContent?.passage || 'Type fast, type clean, and own the round.';
  const renderedText = useMemo(() => (
    sourceText.split('').map((char, index) => {
      let className = 'char untyped';
      if (index < typingText.length) {
        className = typingText[index] === char ? 'char correct' : 'char incorrect';
      } else if (index === typingText.length) {
        className = 'char current';
      }
      return (
        <span key={`${char}-${index}`} className={className}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      );
    })
  ), [sourceText, typingText]);

  const accuracyValue = calculateAccuracy(sourceText, typingText);
  const wpmValue = calculateWPM(typingText, Math.max(1, duration - timeLeft));
  const completionRate = Math.min(100, Math.round((typingText.length / Math.max(sourceText.length, 1)) * 100));
  const equippedSummary = [
    themePreset.label,
    equippedItems.skin || 'Default keyboard skin',
    badgePreset.label,
  ];

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
              {hasSignatureInvites && (
                <input
                  value={friendBattle.customInviteCode}
                  onChange={(event) =>
                    setFriendBattle((prev) => ({ ...prev, customInviteCode: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 12) }))
                  }
                  placeholder="Your custom invite code"
                />
              )}
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
              {hasSignatureInvites
                ? 'Your Signature Invite Pass is active. You can create a private room with your own custom code.'
                : 'Invite code and private password work here for private matches. Buy Signature Invite Pass to create your own custom room code.'}
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
                    {room.players?.length || 0}/2 players | {room.spectators || 0} spectators
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
        <div className={`race-arena ${frameClassName} ${effectClassName}`} style={arenaStyle}>
          <div className="arena-effect-layer" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="player-identity-card">
            <div className={`player-avatar-shell ${frameClassName}`}>
              <div className={`player-avatar ${avatarPreset.aura}`}>
                <span>{avatarPreset.mark}</span>
              </div>
            </div>
            <div className="player-identity-copy">
              <div className="player-identity-meta">
                <span className="player-theme-pill">{themePreset.label}</span>
                <span className="player-badge-pill">{badgePreset.label}</span>
              </div>
              <h2>{currentUser?.username || 'Guest Player'}</h2>
              <p>{equippedSummary.join(' | ')}</p>
            </div>
            <div className="player-identity-stats">
              <div>
                <span>Live WPM</span>
                <strong>{Number.isFinite(wpmValue) ? wpmValue.toFixed(1) : '0.0'}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{Number.isFinite(accuracyValue) ? accuracyValue.toFixed(1) : '100.0'}%</strong>
              </div>
              <div>
                <span>Progress</span>
                <strong>{completionRate}%</strong>
              </div>
            </div>
          </div>

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
            <div
              className="typing-stage"
              onClick={() => inputRef.current?.focus()}
              role="presentation"
            >
              <div className="display-text">
                {renderedText}
              </div>
              <textarea
                ref={inputRef}
                className="typing-input typing-input--overlay"
                value={typingText}
                onChange={handleInputChange}
                placeholder="Start typing here..."
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
            {!liveRoom?.text && generatedContent?.antiCheatHint && (
              <p className="results-challenge">{generatedContent.antiCheatHint}</p>
            )}
          </div>

          <div className="keyboard-preview">
            <div className="keyboard-preview__header">
              <h3>Live Keyboard Deck</h3>
              <p>Your equipped keyboard skin is rendered here while you type.</p>
            </div>
            <div className="keyboard-board" aria-label="On-screen keyboard">
              {KEYBOARD_LAYOUT.map((row, rowIndex) => (
                <div key={`row-${rowIndex}`} className="keyboard-row">
                  {row.map((keyLabel, keyIndex) => {
                    const normalizedKey = normalizeKeyboardKey(keyLabel);
                    const isActive = activeKeys.includes(normalizedKey);
                    const keyClass = [
                      'keyboard-key',
                      keyLabel === 'Backspace' || keyLabel === 'Tab' || keyLabel === 'CapsLock' || keyLabel === 'Enter' || keyLabel === 'Shift'
                        ? 'keyboard-key--wide'
                        : '',
                      keyLabel === 'Space' ? 'keyboard-key--space' : '',
                      isActive ? 'is-active' : '',
                    ].filter(Boolean).join(' ');
                    return (
                      <div key={`${keyLabel}-${keyIndex}`} className={keyClass}>
                        <span>{keyLabel === 'Space' ? 'Space Bar' : keyLabel}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="results-actions">
            <button className="btn btn-danger" onClick={finishRace}>
              Finish Race
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && raceResult && (
        <div className={`race-results race-results--themed ${frameClassName} ${effectClassName}`} style={arenaStyle}>
          <div className="arena-effect-layer arena-effect-layer--results" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
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
                KES {Number(raceResult.winnerPrize || 0).toLocaleString()}
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
            <button className="btn btn-outline-primary" onClick={() => navigate(`/results/${raceResult.id}`)}>
              Open Result Page
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
