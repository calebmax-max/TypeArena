// Mock data for TypeArena app

export const mockUsers = [
  {
    id: 1,
    username: 'SpeedDemon',
    email: 'speed@example.com',
    wpm: 145,
    accuracy: 98.5,
    totalRaces: 142,
    wins: 58,
    balance: 2500,
  }, 
  {
    id: 2,
    username: 'TypingNinja',
    email: 'ninja@example.com',
    wpm: 138,
    accuracy: 97.8,
    totalRaces: 189,
    wins: 76,
    balance: 4200,
  },
  {
    id: 3,
    username: 'QuickFinger',
    email: 'quick@example.com',
    wpm: 132,
    accuracy: 96.2,
    totalRaces: 156,
    wins: 64,
    balance: 1800,
  },
  {
    id: 4,
    username: 'NoMistakes',
    email: 'nomis@example.com',
    wpm: 127,
    accuracy: 99.2,
    totalRaces: 201,
    wins: 82,
    balance: 5600,
  },
  {
    id: 5,
    username: 'LightningBolt',
    email: 'lightning@example.com',
    wpm: 142,
    accuracy: 97.1,
    totalRaces: 98,
    wins: 45,
    balance: 1200,
  },
];

export const mockTournaments = [
  {
    id: 1,
    name: '⚡ Speed Challenge 2026',
    description: 'Race against 50+ typists for KES 10,000 prize pool',
    entryFee: 500,
    prizePool: 10000,
    participants: 47,
    maxParticipants: 100,
    status: 'active',
    startTime: new Date(Date.now() + 2 * 60 * 60 * 1000),
    duration: '60s',
    image: '🏆',
  },
  {
    id: 2,
    name: '🔥 Accuracy Masters',
    description: 'Compete on accuracy, not speed. Win big!',
    entryFee: 300,
    prizePool: 5000,
    participants: 32,
    maxParticipants: 50,
    status: 'active',
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
    duration: '120s',
    image: '💎',
  },
  {
    id: 3,
    name: '⚡ 30 Second Sprint',
    description: 'Ultra-fast 30-second races. Win or go home.',
    entryFee: 100,
    prizePool: 2500,
    participants: 89,
    maxParticipants: 150,
    status: 'active',
    startTime: new Date(Date.now() + 10 * 60 * 1000),
    duration: '30s',
    image: '🚀',
  },
  {
    id: 4,
    name: '👑 Champion Series',
    description: 'Complete 5 races, highest avg WPM wins KES 50,000',
    entryFee: 2000,
    prizePool: 50000,
    participants: 12,
    maxParticipants: 20,
    status: 'upcoming',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
    duration: 'Multi-race',
    image: '💰',
  },
];

export const mockLeaderboard = mockUsers.map((user, idx) => ({
  ...user,
  rank: idx + 1,
}));

export const mockRaceResults = [
  {
    id: 1,
    userId: 1,
    username: 'SpeedDemon',
    wpm: 148,
    accuracy: 98.7,
    place: 1,
    earnings: 1500,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: 2,
    userId: 2,
    username: 'TypingNinja',
    wpm: 141,
    accuracy: 97.9,
    place: 2,
    earnings: 750,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
  {
    id: 3,
    userId: 5,
    username: 'LightningBolt',
    wpm: 139,
    accuracy: 96.8,
    place: 3,
    earnings: 250,
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

export const sampleText = `The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet and serves as an excellent typing practice text. Whether you're a beginner learning to type or an advanced typist honing your skills, consistent practice with varied text helps improve both speed and accuracy. Professional typists know that the key to success is not just raw speed, but maintaining high accuracy while typing. Remember to maintain proper posture and finger position on the keyboard for optimal performance. Every word you practice today builds muscle memory that will last a lifetime.`;

const challengeThemes = [
  {
    name: 'Speed Sprint',
    targetWpm: 50,
    text: 'Speed rewards rhythm. Keep your eyes forward, relax your shoulders, and type with light keystrokes. Smooth flow beats panic tapping every time.',
  },
  {
    name: 'Accuracy Focus',
    targetWpm: 40,
    text: 'Accuracy is built one correct character at a time. Slow down enough to stay precise, then increase pace while keeping mistakes under control.',
  },
  {
    name: 'Numbers and Symbols',
    targetWpm: 45,
    text: 'Typing test 2026: speed, focus, and control. Use symbols like @, #, %, and & correctly while keeping your line clean and readable.',
  },
  {
    name: 'Long Run',
    targetWpm: 55,
    text: 'Endurance challenges reward consistency. Keep your breathing steady and maintain posture so your speed and accuracy stay strong through the final seconds.',
  },
  {
    name: 'Tournament Warmup',
    targetWpm: 60,
    text: 'Warmup rounds sharpen reaction and finger memory. Start controlled, lock into rhythm, and push pace only after your accuracy remains stable.',
  },
  {
    name: 'Technical Words',
    targetWpm: 52,
    text: 'Developers improve with practice on terms like function, variable, interface, backend, and performance. Precision creates trustworthy speed.',
  },
];

const getDifficultyFromTarget = (targetWpm) => {
  if (targetWpm < 45) return 'Beginner';
  if (targetWpm < 58) return 'Intermediate';
  return 'Advanced';
};

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const createAutoChallenges = (count = 4) => {
  const pool = shuffle(challengeThemes);
  return pool.slice(0, Math.min(count, pool.length)).map((theme, idx) => ({
    id: `challenge_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
    title: theme.name,
    prompt: theme.text,
    targetWpm: theme.targetWpm,
    difficulty: getDifficultyFromTarget(theme.targetWpm),
    estimatedChars: theme.text.length,
  }));
};

export const createMockUser = (overrides = {}) => ({
  id: Math.random(),
  username: `Typist_${Math.floor(Math.random() * 10000)}`,
  email: 'user@example.com',
  wpm: 100,
  accuracy: 95,
  totalRaces: 0,
  wins: 0,
  balance: 0,
  ...overrides,
});
