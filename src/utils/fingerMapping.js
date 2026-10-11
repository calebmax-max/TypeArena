const LETTER_FINGERS = {
  q: 'left-pinky', a: 'left-pinky', z: 'left-pinky',
  w: 'left-ring', s: 'left-ring', x: 'left-ring',
  e: 'left-middle', d: 'left-middle', c: 'left-middle',
  r: 'left-index', f: 'left-index', v: 'left-index', t: 'left-index', g: 'left-index', b: 'left-index',
  y: 'right-index', h: 'right-index', n: 'right-index', u: 'right-index', j: 'right-index', m: 'right-index',
  i: 'right-middle', k: 'right-middle', ',': 'right-middle',
  o: 'right-ring', l: 'right-ring', '.': 'right-ring',
  p: 'right-pinky', ';': 'right-pinky', '/': 'right-pinky',
};

const PHYSICAL_KEYS = {
  '`': 'left-pinky', '1': 'left-pinky', '2': 'left-ring', '3': 'left-middle', '4': 'left-index', '5': 'left-index',
  '6': 'right-index', '7': 'right-index', '8': 'right-middle', '9': 'right-ring', '0': 'right-pinky',
  '-': 'right-pinky', '=': 'right-pinky', '[': 'right-pinky', ']': 'right-pinky', '\\': 'right-pinky',
  "'": 'right-pinky',
  ...LETTER_FINGERS,
};

const SHIFT_SYMBOLS = {
  '~': '`', '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
  '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/',
};

const FINGER_LABELS = {
  'left-pinky': 'left pinky', 'left-ring': 'left ring finger', 'left-middle': 'left middle finger', 'left-index': 'left index finger',
  'right-index': 'right index finger', 'right-middle': 'right middle finger', 'right-ring': 'right ring finger', 'right-pinky': 'right pinky',
  thumbs: 'either thumb',
};

export const DEFAULT_FINGER_MAPPING = Object.freeze({
  ...Object.fromEntries(Object.entries(PHYSICAL_KEYS).map(([key, finger]) => [key, { key, finger, needsShift: false }])),
  ' ': { key: 'Space', finger: 'thumbs', needsShift: false },
  ...Object.fromEntries(Object.entries(SHIFT_SYMBOLS).map(([character, key]) => [character, { key, finger: PHYSICAL_KEYS[key], needsShift: true }])),
  ...Object.fromEntries(Object.entries(LETTER_FINGERS)
    .filter(([character]) => /^[a-z]$/.test(character))
    .map(([character, finger]) => [character.toUpperCase(), { key: character.toUpperCase(), finger, needsShift: true }])),
});

export function getFingerInstruction(character, mapping = DEFAULT_FINGER_MAPPING) {
  const value = String(character ?? '');
  const configured = mapping[value] || DEFAULT_FINGER_MAPPING[value];
  if (configured) return configured;
  if (value === '<BACKSPACE>') return { key: 'Backspace', finger: 'right-pinky', needsShift: false };
  return { key: value.length === 1 ? value.toUpperCase() : value, finger: null, needsShift: false };
}

export function fingerLabel(finger) {
  return FINGER_LABELS[finger] || 'the highlighted finger';
}

export function createFingerMapping(overrides = {}) {
  return { ...DEFAULT_FINGER_MAPPING, ...overrides };
}
