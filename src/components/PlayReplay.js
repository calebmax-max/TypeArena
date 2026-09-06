import React, { useState } from 'react';

export default function PlayReplay({ frames }) {
  const [index, setIndex] = useState(0);
  const frame = frames[index] || frames[0];
  const totalFrames = frames.length;

  return (
    <div className="replay-player">
      <div className="replay-player__header">
        <span className="replay-player__title">Replay</span>
        <span className="replay-player__counter">Frame {index + 1} / {totalFrames}</span>
      </div>
      <div className="replay-player__text" aria-live="polite">
        {frame?.typedText?.slice(-120) || 'Race start'}
      </div>
      <input
        type="range"
        className="replay-player__scrubber"
        min={0}
        max={totalFrames - 1}
        value={index}
        onChange={(e) => setIndex(Number(e.target.value))}
        aria-label="Scrub through replay frames"
      />
      <div className="replay-player__controls">
        <button
          className="btn btn-sm btn-outline-light"
          onClick={() => setIndex((current) => Math.max(0, current - 1))}
          disabled={index === 0}
        >‹ Prev</button>
        <button
          className="btn btn-sm btn-outline-light"
          onClick={() => setIndex((current) => Math.min(totalFrames - 1, current + 1))}
          disabled={index === totalFrames - 1}
        >Next ›</button>
      </div>
    </div>
  );
}
