// The Training curriculum: 7 units, each a straight line of lessons.
// Nothing is skippable except via the placement test (see placementTest.js) -
// that's what keeps a fast-but-sloppy typist from breezing past fundamentals.
//
// IMPORTANT: PRO_CERT_LESSON_ID must match the backend's
// TRAINING_PRO_CERT_LESSON_ID env var (app_backend.py defaults to
// 'pro-cert' too, so this lines up out of the box). If you ever rename
// this lesson's id, update the backend env var to match, or the
// time-to-Pro analytics will quietly stop finding any data.
export const PRO_CERT_LESSON_ID = 'pro-cert';
export const PRO_CERT_REQUIRED_PASSES = 3;

// --- Practice text generation --------------------------------------------
// Early lessons (kind: 'keys') generate pseudo-word drills from an allowed
// character set, so the drill only ever touches keys the learner has been
// introduced to. Later lessons (kind: 'words' / 'sentences') sample from
// fixed banks, which reads more naturally once real words are in play.

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateKeyDrill(keys, wordCount = 10) {
  const chars = keys.split('');
  const words = [];
  for (let i = 0; i < wordCount; i += 1) {
    const len = 2 + Math.floor(Math.random() * 3); // 2-4 chars per drill "word"
    let word = '';
    for (let j = 0; j < len; j += 1) {
      word += pickRandom(chars);
    }
    words.push(word);
  }
  return words.join(' ');
}

function generateFromBank(bank, targetLength = 180) {
  const parts = [];
  let length = 0;
  const pool = [...bank];
  while (length < targetLength) {
    if (pool.length === 0) pool.push(...bank);
    const idx = Math.floor(Math.random() * pool.length);
    const [chosen] = pool.splice(idx, 1);
    parts.push(chosen);
    length += chosen.length + 1;
  }
  return parts.join(' ');
}

const SHORT_WORD_BANK = [
  'cat', 'dog', 'run', 'jump', 'the', 'and', 'for', 'you', 'are', 'not',
  'but', 'can', 'get', 'let', 'now', 'own', 'put', 'say', 'too', 'use',
];

const COMMON_WORD_BANK = [
  'about', 'after', 'again', 'below', 'could', 'every', 'first', 'found',
  'great', 'group', 'house', 'large', 'money', 'never', 'other', 'place',
  'right', 'small', 'sound', 'still', 'their', 'there', 'these', 'thing',
  'think', 'three', 'water', 'where', 'which', 'world', 'would', 'write',
];

const LONG_WORD_BANK = [
  'beautiful', 'community', 'different', 'education', 'important', 'knowledge',
  'necessary', 'operation', 'political', 'reference', 'situation', 'technique',
  'ourselves', 'yesterday', 'chocolate', 'wonderful',
];

const NUMBER_MIX_BANK = [
  'Room 42 opens at 9', 'Order 1029 shipped on the 3rd', 'Page 17 of 250',
  'Section 5B has 12 seats', 'Flight 802 departs at 6', 'Item 34 costs 19 dollars',
];

const PUNCTUATION_BANK = [
  "Wait, isn't that yours?", 'She said, "Not today."', "It's fine, don't worry.",
  'Yes, no, maybe — who knows?', 'He asked: "Where next?"', "That's it; we're done.",
  'Cold, wet, and windy: perfect.', "Don't stop; keep going!",
];

const SENTENCE_BANK = [
  'The quiet street held its breath before the storm arrived.',
  'She practiced every morning, certain the effort would pay off.',
  'A good habit, repeated daily, becomes nearly invisible.',
  'The old library smelled of dust and quiet ambition.',
  'Nobody expected the meeting to run three hours long.',
  'He typed faster once he stopped watching his hands.',
  'The recipe called for patience more than any ingredient.',
  'Rain tapped the window in a rhythm nobody could predict.',
];

const FLOWING_PARAGRAPH_BANK = [
  'Learning to type well is less about speed and more about not thinking ' +
    'at all. The fingers learn a path, and the mind gets out of the way.',
  'Every skill worth having rewards the boring repetitions nobody wants to ' +
    'admit they needed. Typing is no exception, and neither is patience.',
  'The difference between a fast typist and a sloppy one usually comes down ' +
    'to whether they trust their hands to know where the keys are.',
];

const SPEED_BURST_BANK = [
  'Quick brown foxes jump over lazy dogs while the pack watches quietly.',
  'Every second counts once the timer starts, so trust your fingers completely.',
  'Speed without accuracy is just fast mistakes, so keep both moving together.',
  'The fastest typists barely look down, letting muscle memory do the work.',
];

const PRO_CERT_BANK = [
  'Professional typing certification requires more than a single lucky run; ' +
    'it requires consistency across three separate, unassisted attempts, each ' +
    'meeting the same demanding bar for speed and accuracy without exception.',
  'A certified typist can sustain a high words-per-minute rate over a full ' +
    'passage of varied sentence structure, correct punctuation, and mixed case, ' +
    'without a meaningful drop in accuracy from the first line to the last.',
  'This final assessment mirrors real working conditions: unpredictable text, ' +
    'no practice runs immediately beforehand, and a pass bar that does not bend ' +
    'just because the passage happened to be a difficult one this time.',
];

export function generateLessonText(lesson) {
  switch (lesson.kind) {
    case 'keys':
      return generateKeyDrill(lesson.keys, lesson.wordCount || 12);
    case 'words':
      return generateFromBank(lesson.bank, lesson.targetLength || 160);
    case 'sentences':
    case 'text':
      return generateFromBank(lesson.bank, lesson.targetLength || 220);
    default:
      return generateFromBank(SENTENCE_BANK, 200);
  }
}

// --- The curriculum itself -------------------------------------------------
// Each lesson: id (unique, sent to the backend as lessonId), unitId, title,
// a text-generation spec, and a pass bar (minWpm / minAccuracy, 0-100).
// requiredPasses defaults to 1; only Pro Certification asks for more than one.

export const UNITS = [
  {
    id: 'u1',
    title: 'Foundations',
    lessons: [
      {
        id: 'u1-l1', unitId: 'u1', title: 'Home Row Basics',
        kind: 'keys', keys: 'asdfjkl;', wordCount: 12,
        minWpm: 10, minAccuracy: 90,
      },
      {
        id: 'u1-l2', unitId: 'u1', title: 'Home Row Extended',
        kind: 'keys', keys: 'asdfghjkl;', wordCount: 12,
        minWpm: 15, minAccuracy: 90,
      },
      {
        id: 'u1-l3', unitId: 'u1', title: 'Top Row Intro',
        kind: 'keys', keys: 'qwertyuiopasdfghjkl;', wordCount: 14,
        minWpm: 18, minAccuracy: 90,
      },
      {
        id: 'u1-l4', unitId: 'u1', title: 'Bottom Row Intro',
        kind: 'keys', keys: 'zxcvbnm,.qwertyuiopasdfghjkl;', wordCount: 14,
        minWpm: 20, minAccuracy: 90,
      },
    ],
  },
  {
    id: 'u2',
    title: 'Building Words',
    lessons: [
      {
        id: 'u2-l1', unitId: 'u2', title: 'Short Words',
        kind: 'words', bank: SHORT_WORD_BANK, targetLength: 140,
        minWpm: 22, minAccuracy: 90,
      },
      {
        id: 'u2-l2', unitId: 'u2', title: 'Common Words',
        kind: 'words', bank: COMMON_WORD_BANK, targetLength: 160,
        minWpm: 25, minAccuracy: 90,
      },
      {
        id: 'u2-l3', unitId: 'u2', title: 'Longer Words',
        kind: 'words', bank: LONG_WORD_BANK, targetLength: 170,
        minWpm: 28, minAccuracy: 90,
      },
    ],
  },
  {
    id: 'u3',
    title: 'Full Keyboard',
    lessons: [
      {
        id: 'u3-l1', unitId: 'u3', title: 'All Letters Mixed',
        kind: 'words', bank: [...SHORT_WORD_BANK, ...COMMON_WORD_BANK], targetLength: 180,
        minWpm: 30, minAccuracy: 91,
      },
      {
        id: 'u3-l2', unitId: 'u3', title: 'Numbers Row',
        kind: 'sentences', bank: NUMBER_MIX_BANK, targetLength: 180,
        minWpm: 30, minAccuracy: 90,
      },
      {
        id: 'u3-l3', unitId: 'u3', title: 'Capitalization',
        kind: 'sentences', bank: SENTENCE_BANK, targetLength: 190,
        minWpm: 32, minAccuracy: 91,
      },
    ],
  },
  {
    id: 'u4',
    title: 'Punctuation',
    lessons: [
      {
        id: 'u4-l1', unitId: 'u4', title: 'Commas & Periods',
        kind: 'sentences', bank: PUNCTUATION_BANK, targetLength: 180,
        minWpm: 32, minAccuracy: 92,
      },
      {
        id: 'u4-l2', unitId: 'u4', title: 'Quotes & Apostrophes',
        kind: 'sentences', bank: PUNCTUATION_BANK, targetLength: 190,
        minWpm: 33, minAccuracy: 92,
      },
      {
        id: 'u4-l3', unitId: 'u4', title: 'Full Punctuation Mix',
        kind: 'sentences', bank: [...PUNCTUATION_BANK, ...SENTENCE_BANK], targetLength: 200,
        minWpm: 35, minAccuracy: 92,
      },
    ],
  },
  {
    id: 'u5',
    title: 'Sentences & Flow',
    lessons: [
      {
        id: 'u5-l1', unitId: 'u5', title: 'Short Sentences',
        kind: 'sentences', bank: SENTENCE_BANK, targetLength: 200,
        minWpm: 38, minAccuracy: 93,
      },
      {
        id: 'u5-l2', unitId: 'u5', title: 'Flowing Paragraphs',
        kind: 'text', bank: FLOWING_PARAGRAPH_BANK, targetLength: 220,
        minWpm: 42, minAccuracy: 93,
      },
      {
        id: 'u5-l3', unitId: 'u5', title: 'Varied Sentence Lengths',
        kind: 'text', bank: [...SENTENCE_BANK, ...FLOWING_PARAGRAPH_BANK], targetLength: 230,
        minWpm: 45, minAccuracy: 93,
      },
    ],
  },
  {
    id: 'u6',
    title: 'Speed Building',
    lessons: [
      {
        id: 'sb1', unitId: 'u6', title: 'Speed Burst — 50 WPM',
        kind: 'sentences', bank: SPEED_BURST_BANK, targetLength: 220,
        minWpm: 50, minAccuracy: 94,
      },
      {
        id: 'sb2', unitId: 'u6', title: 'Speed Burst — 55 WPM',
        kind: 'sentences', bank: SPEED_BURST_BANK, targetLength: 230,
        minWpm: 55, minAccuracy: 94,
      },
      {
        id: 'sp3', unitId: 'u6', title: 'Speed Burst — 60 WPM',
        kind: 'sentences', bank: SPEED_BURST_BANK, targetLength: 240,
        minWpm: 60, minAccuracy: 95,
      },
    ],
  },
  {
    id: 'u7',
    title: 'Pro Certification',
    lessons: [
      {
        id: PRO_CERT_LESSON_ID, unitId: 'u7', title: 'Pro Certification',
        kind: 'text', bank: PRO_CERT_BANK, targetLength: 280,
        minWpm: 65, minAccuracy: 97,
        requiredPasses: PRO_CERT_REQUIRED_PASSES,
      },
    ],
  },
];

// Flat, ordered list of every lesson - this ordering IS the curriculum path.
export const LESSON_SEQUENCE = UNITS.flatMap((unit) => unit.lessons);

export function getLessonById(lessonId) {
  return LESSON_SEQUENCE.find((lesson) => lesson.id === lessonId) || null;
}

export function getUnitById(unitId) {
  return UNITS.find((unit) => unit.id === unitId) || null;
}

export function getNextLessonId(lessonId) {
  const idx = LESSON_SEQUENCE.findIndex((lesson) => lesson.id === lessonId);
  if (idx === -1 || idx === LESSON_SEQUENCE.length - 1) return null;
  return LESSON_SEQUENCE[idx + 1].id;
}

export function requiredPassesFor(lesson) {
  return lesson.requiredPasses || 1;
}