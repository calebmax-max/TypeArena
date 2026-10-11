import React from 'react';
import TypingBox from './TypingBox';
import FingerGuide from './FingerGuide';
import VirtualKeyboard from './VirtualKeyboard';

export default function TypingPractice({ targetText, typedText, onChange, inputRef, disabled, expectedCharacter, mapping, mode, showGuidance, onToggleGuidance, liveStats }) {
  return (
    <div className="typing-practice">
      <div className="training-keyboard-toggle">
        <label><input type="checkbox" checked={showGuidance} onChange={(event) => onToggleGuidance(event.target.checked)} /> Show finger guidance</label>
        <span>{mode === 'challenge' ? 'Optional in challenge mode.' : 'Use it while learning, then hide it for no-look practice.'}</span>
      </div>
      {showGuidance && <>
        <VirtualKeyboard expectedCharacter={expectedCharacter} mapping={mapping} />
        <FingerGuide expectedCharacter={expectedCharacter} mapping={mapping} mode={mode} />
      </>}
      {liveStats && <p className="training-lesson__live-stats" aria-live="polite">{Math.round(liveStats.wpm)} WPM · {Math.round(liveStats.accuracy)}% accuracy so far</p>}
      <TypingBox targetText={targetText} typedText={typedText} onChange={onChange} inputRef={inputRef} disabled={disabled} blockPaste />
    </div>
  );
}
