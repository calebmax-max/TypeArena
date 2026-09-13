import React, { useMemo, useState } from 'react';
import TypingBox from 'src/TypingBox';
import { useTypingSession } from 'src/useTypingSession';
import { generateLessonText, requiredPassesFor } from 'src/curriculum';
import { recordAttempt, loadProgress } from 'src/trainingProgress';

export default function LessonRunner({ lesson, onLessonPassed }) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [outcome, setOutcome] = useState(null); // { wpm, accuracy, passed, passCount }
  const targetText = useMemo(() => generateLessonText(lesson), [lesson, attemptKey]);
  const required = requiredPassesFor(lesson);

  const { typedText, finished, handleChange, inputRef } = useTypingSession(targetText, {
    onFinish: (stats) => {
      const passed = stats.wpm >= lesson.minWpm && stats.accuracy >= lesson.minAccuracy;
      const state = recordAttempt({ lesson, wpm: stats.wpm, accuracy: stats.accuracy, passed });
      setOutcome({ ...stats, passed, passCount: state.passCount });
    },
  });

  function retry() {
    setOutcome(null);
    setAttemptKey((k) => k + 1);
  }

  const fullyPassed = outcome && outcome.passCount >= required;

  return (
    <div className="training-lesson">
      <div className="training-lesson__header">
        <h2>{lesson.title}</h2>
        <p className="training-lesson__bar">
          Pass bar: {lesson.minWpm} WPM at {lesson.minAccuracy}% accuracy
          {required > 1 && ` · needs ${required} separate passes`}
        </p>
      </div>

      {!outcome && (
        <TypingBox
          targetText={targetText}
          typedText={typedText}
          onChange={handleChange}
          inputRef={inputRef}
          disabled={finished}
        />
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
              <button type="button" className="training-button" onClick={retry}>
                Attempt {outcome.passCount + 1}
              </button>
            </>
          )}

          {!outcome.passed && (
            <>
              <p>
                Not quite - needed {lesson.minWpm} WPM at {lesson.minAccuracy}% accuracy. Same
                lesson, new passage.
              </p>
              <button type="button" className="training-button" onClick={retry}>
                Retry lesson
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}