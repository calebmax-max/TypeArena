import React from 'react';

const FINGER_BY_KEY = {
  q: 'left-pinky', a: 'left-pinky', z: 'left-pinky',
  w: 'left-ring', s: 'left-ring', x: 'left-ring',
  e: 'left-middle', d: 'left-middle', c: 'left-middle',
  r: 'left-index', f: 'left-index', v: 'left-index', t: 'left-index', g: 'left-index', b: 'left-index',
  y: 'right-index', h: 'right-index', n: 'right-index', u: 'right-index', j: 'right-index', m: 'right-index',
  i: 'right-middle', k: 'right-middle', ',': 'right-middle',
  o: 'right-ring', l: 'right-ring', '.': 'right-ring',
  p: 'right-pinky', ';': 'right-pinky', '/': 'right-pinky',
  ' ': 'thumbs',
};

function normalizeKey(key) {
  return String(key || '').toLowerCase();
}

export default function FingerTypingGuide({ expectedKey }) {
  const activeFinger = FINGER_BY_KEY[normalizeKey(expectedKey)] || '';

  return (
    <section className="training-finger-guide" aria-label="Finger placement guide">
      <div className="training-finger-guide__copy">
        <span className="training-eyebrow">Next key</span>
        <strong>{expectedKey === ' ' ? 'Space' : expectedKey || '—'}</strong>
        <span>{activeFinger === 'thumbs' ? 'Use either thumb' : activeFinger ? `Use your ${activeFinger.replace('-', ' ')}` : 'Follow the highlighted key'}</span>
      </div>
      <div className="training-finger-guide__hands" aria-hidden="true">
        <div className="training-hand training-hand--left">
          {['left-pinky', 'left-ring', 'left-middle', 'left-index'].map((finger) => (
            <span key={finger} className={`training-finger training-finger--${finger}${activeFinger === finger ? ' is-active' : ''}`} />
          ))}
          <span className={`training-finger training-finger--left-thumb${activeFinger === 'thumbs' ? ' is-active' : ''}`} />
        </div>
        <div className="training-hand training-hand--right">
          <span className={`training-finger training-finger--right-thumb${activeFinger === 'thumbs' ? ' is-active' : ''}`} />
          {['right-index', 'right-middle', 'right-ring', 'right-pinky'].map((finger) => (
            <span key={finger} className={`training-finger training-finger--${finger}${activeFinger === finger ? ' is-active' : ''}`} />
          ))}
        </div>
      </div>
    </section>
  );
}
