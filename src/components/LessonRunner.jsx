import React, { useMemo, useState } from 'react';
import TypingBox from './TypingBox';
import { useTypingSession } from './useTypingSession';
import { generateLessonText, requiredPassesFor } from './curriculum';
import { recordAttempt } from './trainingProgress';

export default function LessonRunner({ lesson, onLessonPassed }) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [outcome, setOutcome] = useState(null); // { wpm, accuracy, passed, passCount }
  // attemptKey isn't read inside generateLessonText - it exists purely to force a
  // fresh passage when moving on to the next required pass (nextAttempt).
  // A failed retry (retrySamePassage) intentionally leaves attemptKey alone
  // so the learner re-types the exact passage they just failed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targetText = useMemo(() => generateLessonText(lesson), [lesson, attemptKey]);
  const required = requiredPassesFor(lesson);

  const { typedText, finished, handleChange, reset, inputRef, liveStats } = useTypingSession(targetText, {
    onFinish: (stats) => {
      const passed = stats.wpm >= lesson.minWpm && stats.accuracy >= lesson.minAccuracy;
      const state = recordAttempt({ lesson, wpm: stats.wpm, accuracy: stats.accuracy, passed });
      setOutcome({ ...stats, passed, passCount: state.passCount });
    },
  });

  // Failed the bar: keep the exact same passage, just clear the typed state
  // so the learner can have another go at it.
  function retrySamePassage() {
    setOutcome(null);
    reset();
  }

  // Passed, but this lesson needs more than one qualifying pass: draw a new
  // passage for the next attempt rather than repeating the one just typed.
  function nextAttempt() {
    setOutcome(null);
    setAttemptKey((k) => k + 1);
    reset();
  }

  const fullyPassed = outcome && outcome.passCount >= required;

  return (
    <div className="training-lesson">
      <div className="training-lesson__header">
        <h2>{lesson.title}</h2>
        <div className="training-lesson__bar">
          <span className="training-lesson__bar-stat">{lesson.minWpm} WPM</span>
          <span className="training-lesson__bar-divider" aria-hidden="true" />
          <span className="training-lesson__bar-stat">{lesson.minAccuracy}% accuracy</span>
        </div>

        {required > 1 && (
          <div
            className="training-lesson__passes"
            role="img"
            aria-label={`${outcome ? outcome.passCount : 0} of ${required} required passes complete`}
          >
            {Array.from({ length: required }).map((_, i) => (
              <span
                key={i}
                className={
                  'training-lesson__pass-segment' +
                  (outcome && i < outcome.passCount ? ' training-lesson__pass-segment--filled' : '')
                }
              />
            ))}
            <span className="training-lesson__passes-label">
              {outcome ? outcome.passCount : 0}/{required} passes
            </span>
          </div>
        )}
      </div>

      {!outcome && (
        <>
          {liveStats && (
            <p className="training-lesson__live-stats" aria-live="polite">
              {Math.round(liveStats.wpm)} WPM · {Math.round(liveStats.accuracy)}% accuracy so far
            </p>
          )}
          <TypingBox
            targetText={targetText}
            typedText={typedText}
            onChange={handleChange}
            inputRef={inputRef}
            disabled={finished}
            blockPaste
          />
        </>
      )}

      {outcome && (
        <div className={`training-lesson__result ${outcome.passed ? 'training-lesson__result--pass' : 'training-lesson__result--fail'}`}>
          <p className="training-lesson__result-stats">
            {Math.round(outcome.wpm)} WPM · {Math.round(outcome.accuracy)}% accuracy
          </p>

          {outcome.passed && fullyPassed && (
            <>
              <p>Lesson passed{required > 1 ? ` (${outcome.passCount}/${required} required passes)` : ''}.</p>
              <button type="button" className="training-button" onClick={() => onLessonPassed(lesson.id)}>
                Continue
              </button>
            </>
          )}

          {outcome.passed && !fullyPassed && (
            <>
              <p>
                That's pass {outcome.passCount} of {required} needed - one good run isn't enough on
                this one. One more like that and you're through.
              </p>
              <button type="button" className="training-button" onClick={nextAttempt}>
                Attempt {outcome.passCount + 1}
              </button>
            </>
          )}

          {!outcome.passed && (
            <>
              <p>
                Not quite - needed {lesson.minWpm} WPM at {lesson.minAccuracy}% accuracy. Same
                passage, have another go.
              </p>
              <button type="button" className="training-button" onClick={retrySamePassage}>
                Retry lesson
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}