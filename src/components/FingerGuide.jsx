import React from 'react';
import HandIllustration from './HandIllustration';
import { fingerLabel, getFingerInstruction } from '../utils/fingerMapping';

export default function FingerGuide({ expectedCharacter, mapping, mode = 'practice' }) {
  const instruction = getFingerInstruction(expectedCharacter, mapping);
  const modeLabel = mode === 'intro' ? 'Learning mode' : mode === 'challenge' ? 'Challenge guidance' : 'Practice guidance';
  return (
    <section className="finger-guide" aria-label="Typing finger guidance">
      <div className="finger-guide__instruction" aria-live="polite">
        <span className="training-eyebrow">{modeLabel}</span>
        <strong>{expectedCharacter === ' ' ? 'Space' : expectedCharacter || 'Ready'}</strong>
        <span>{instruction.finger ? `Use your ${fingerLabel(instruction.finger)}${instruction.needsShift ? ' with Shift' : ''}` : 'Follow the highlighted key'}</span>
      </div>
      <HandIllustration activeFinger={instruction.finger} />
    </section>
  );
}
