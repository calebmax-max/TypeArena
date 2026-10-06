import React, { useState } from 'react';
import { useTypingSession } from './useTypingSession';
import { applyPlacement } from './trainingProgress';
import { findPlacementLesson, PLACEMENT_DURATION_SECONDS, PLACEMENT_SAMPLE_TEXT } from './placement';

export default function PlacementTest({ lessons, onComplete, onCancel }) {
  const [result, setResult] = useState(null);
  const { typedText, finished, handleChange, reset, inputRef, liveStats, timeRemaining } = useTypingSession(PLACEMENT_SAMPLE_TEXT, {
    maxDurationSeconds: PLACEMENT_DURATION_SECONDS,
    onFinish: (stats) => setResult(stats),
  });

  function acceptResult() {
    if (!result || !lessons.length) return;
    const startLessonId = findPlacementLesson(result.wpm, result.accuracy, lessons);
    applyPlacement(startLessonId, lessons);
    onComplete(startLessonId);
  }

  return (
    <section className="training-placement" aria-labelledby="placement-title">
      <div>
        <span className="training-eyebrow">Optional starting-point check</span>
        <h1 id="placement-title">Find the right lesson for you</h1>
        <p>Type naturally for 30 seconds. This is not an exam or certificate; it helps us avoid making experienced typists repeat basics.</p>
      </div>
      {!result ? (
        <>
          <div className="training-placement__instructions">
            <strong>Use your normal pace</strong>
            <span>Accuracy matters more than forcing speed. You can restart before typing.</span>
          </div>
          <div className="training-typing-box__passage training-placement__passage" aria-label="Placement passage">
            {PLACEMENT_SAMPLE_TEXT}
          </div>
          <p className="training-placement__timer" aria-live="polite">
            {timeRemaining === null ? 'Ready when you are' : `${Math.ceil(timeRemaining)} seconds remaining`}
            {liveStats && ` · ${Math.round(liveStats.wpm)} WPM · ${Math.round(liveStats.accuracy)}% accuracy`}
          </p>
          <textarea
            ref={inputRef}
            className="training-placement__input"
            value={typedText}
            onChange={handleChange}
            disabled={finished}
            placeholder="Click here and start typing..."
            aria-label="Type the placement passage"
            autoFocus
          />
          <div className="training-placement__actions">
            <button type="button" className="training-button training-button--quiet" onClick={reset}>Restart sample</button>
            <button type="button" className="training-button" onClick={onCancel}>Skip for now</button>
          </div>
        </>
      ) : (
        <div className="training-placement__result">
          <span className="training-eyebrow">Your starting point</span>
          <h2>{Math.round(result.wpm)} WPM · {Math.round(result.accuracy)}% accuracy</h2>
          <p>We will start you at the first lesson that matches this sample. You can still review earlier lessons at any time.</p>
          <div className="training-placement__actions">
            <button type="button" className="training-button" onClick={acceptResult}>Start my pathway</button>
            <button type="button" className="training-button training-button--quiet" onClick={() => { setResult(null); reset(); }}>Try again</button>
          </div>
        </div>
      )}
    </section>
  );
}
