import React from 'react';

const FINGERS = ['pinky', 'ring', 'middle', 'index'];

function Hand({ side, activeFinger }) {
  const prefix = `${side}-`;
  return (
    <svg className={`finger-hand finger-hand--${side}`} viewBox="0 0 180 150" role="img" aria-label={`${side} hand finger guide`}>
      <path className="finger-hand__palm" d={side === 'left' ? 'M35 140 C31 111 40 91 62 82 C80 75 108 78 126 96 L143 116 C149 124 141 140 130 143 Z' : 'M145 140 C149 111 140 91 118 82 C100 75 72 78 54 96 L37 116 C31 124 39 140 50 143 Z'} />
      {FINGERS.map((finger, index) => {
        const key = `${prefix}${finger}`;
        const x = side === 'left' ? [38, 61, 84, 108][index] : [34, 58, 82, 105][index];
        const y = [65, 35, 18, 30][index];
        const height = [48, 78, 96, 82][index];
        return <rect key={key} className={`finger-hand__finger finger-hand__finger--${key}${activeFinger === key ? ' is-active' : ''}`} x={x} y={y} width="21" height={height} rx="10" />;
      })}
      <rect className={`finger-hand__finger finger-hand__finger--${prefix}thumb${activeFinger === 'thumbs' ? ' is-active' : ''}`} x={side === 'left' ? 111 : 48} y="91" width="22" height="54" rx="11" transform={side === 'left' ? 'rotate(-42 122 118)' : 'rotate(42 59 118)'} />
    </svg>
  );
}

export default function HandIllustration({ activeFinger }) {
  return (
    <div className="finger-hands" aria-hidden="true">
      <Hand side="left" activeFinger={activeFinger} />
      <Hand side="right" activeFinger={activeFinger} />
    </div>
  );
}
