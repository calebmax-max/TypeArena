import React, { useState } from 'react';
import TypingBox from './TypingBox';
import { useTypingSession } from './useTypingSession';
import { PLACEMENT_DURATION_SECONDS, PLACEMENT_SAMPLE_TEXT, findPlacementLesson } from './placementTest';
import { LESSON_SEQUENCE, getLessonById } from './curriculum';
import { applyPlacement } from './trainingProgress';

export default function PlacementTest({ onPlaced }) {
  const [result, setResult] = useState(null);

  const { typedText, timeRemaining, finished, handleChange, inputRef } = useTypingSession(
    PLACEMENT_SAMPLE_TEXT,
    {
      maxDurationSeconds: PLACEMENT_DURATION_SECONDS,
      onFinish: (stats) => {
        const startLessonId = findPlacementLesson(stats.wpm, stats.accuracy, LESSON_SEQUENCE);
        applyPlacement(startLessonId, LESSON_SEQUENCE);
        setResult({ ...stats, startLessonId });
      },
    },
  );

  if (result) {
    const startLesson = getLessonById(result.startLessonId);
    const skippedCount = LESSON_SEQUENCE.findIndex((l) => l.id === result.startLessonId);
    return (
      <div className="training-placement training-placement--done">
        <h2>Placement complete</h2>
        <p className="training-placement__stats">
          {Math.round(result.wpm)} WPM · {Math.round(result.accuracy)}% accuracy
        </p>
        <p>
          {skippedCount > 0
            ? `That clears the first ${skippedCount} lesson${skippedCount === 1 ? '' : 's'}. `
            : 'Starting from the very first lesson. '}
          You're starting at <strong>{startLesson.title}</strong>.
        </p>
        <button type="button" className="training-button" onClick={() => onPlaced(result.startLessonId)}>
          Start training
        </button>
      </div>
    );
  }

  return (
    <div className="training-placement">
      <h2>Quick placement test</h2>
      <p>
        Type this passage naturally for up to {PLACEMENT_DURATION_SECONDS} seconds. This isn't
        graded like a lesson - it just finds where you should start.
      </p>
      {!finished && typeof timeRemaining === 'number' && (
        <p className="training-placement__timer">{Math.ceil(timeRemaining)}s remaining</p>
      )}
      <TypingBox
        targetText={PLACEMENT_SAMPLE_TEXT}
        typedText={typedText}
        onChange={handleChange}
        inputRef={inputRef}
        disabled={finished}
      />
    </div>
  );
}