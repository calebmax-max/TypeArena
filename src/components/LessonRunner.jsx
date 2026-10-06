import React, { useEffect, useMemo, useState } from 'react';
import TypingBox from './TypingBox';
import PlayKeyboardDeck from './PlayKeyboardDeck';
import { useTypingSession } from './useTypingSession';
import { recordAttempt } from './trainingProgress';
import { startProblemKeyPractice, startTrainingLesson, submitTrainingAttempt } from '../utils/typingApi';

export default function LessonRunner({ lesson, onLessonPassed }) {
  const [attemptKey, setAttemptKey] = useState(0);
  const [outcome, setOutcome] = useState(null); // { wpm, accuracy, passed, passCount }
  const [attempt, setAttempt] = useState(null);
  const [attemptError, setAttemptError] = useState('');
  const [showKeyboard, setShowKeyboard] = useState(true);
  // attemptKey isn't read inside generateLessonText - it exists purely to force a
  // fresh passage when moving on to the next required pass (nextAttempt).
  // A failed retry (retrySamePassage) intentionally leaves attemptKey alone
  // so the learner re-types the exact passage they just failed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const targetText = useMemo(() => lesson.content || '', [lesson, attemptKey]);
  const required = Number(lesson.requiredPasses || 1);

  useEffect(() => {
    let active = true;
    setAttempt(null);
    setAttemptError('');
    const startRequest = lesson.id === 'problem-keys'
      ? startProblemKeyPractice(lesson.content)
      : startTrainingLesson(lesson.id);
    startRequest
      .then((result) => { if (active) setAttempt(result); })
      .catch((error) => { if (active) setAttemptError(error.message || 'Could not start this lesson.'); });
    return () => { active = false; };
  }, [lesson.id]);

  const { typedText, finished, handleChange, reset, inputRef, liveStats } = useTypingSession(targetText, {
    maxDurationSeconds: Number(lesson.duration) || 120,
    onFinish: async (stats, finalTypedText, keystrokeLog) => {
      const keyErrors = {};
      for (let index = 0; index < targetText.length; index += 1) {
        if ((finalTypedText[index] || '') !== targetText[index]) {
          const key = targetText[index];
          if (key && key.trim()) keyErrors[key] = (keyErrors[key] || 0) + 1;
        }
      }
      try {
        const serverResult = attempt ? await submitTrainingAttempt({
          eventId: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          lessonId: lesson.id,
          unitId: lesson.unitId,
          attemptToken: attempt.token,
          typedText: finalTypedText,
          targetText: lesson.id === 'problem-keys' ? targetText : undefined,
          keystrokeLog,
          keyErrors,
        }) : null;
        const result = serverResult || stats;
        const state = recordAttempt({ lesson, wpm: result.wpm, accuracy: result.accuracy, passed: result.passed, keyErrors, skipServerSync: Boolean(serverResult) });
        setOutcome({ ...stats, wpm: result.wpm, accuracy: result.accuracy, passed: Boolean(result.passed), passCount: state.passCount });
      } catch (error) {
        setAttemptError(error.message || 'Could not save this attempt. Please try again.');
      }
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
  const lessonTypeLabel = lesson.lessonType === 'intro' ? 'Learn' : lesson.lessonType === 'test' ? 'Assessment' : lesson.lessonType === 'challenge' ? 'TypeArena Challenge' : 'Guided Practice';
  const lessonObjective = lesson.objective || (
    lesson.lessonType === 'intro'
      ? 'Learn the technique before increasing your speed.'
      : lesson.lessonType === 'test'
        ? 'Demonstrate accurate, consistent typing under a clear standard.'
        : lesson.lessonType === 'challenge'
          ? 'Apply your keyboard control when the exercise becomes more demanding.'
          : 'Build accuracy and rhythm through one focused practice exercise.'
  );
  const expectedKey = targetText[typedText.length] || '';

  return (
    <div className="training-lesson">
      <div className="training-lesson__header">
        <h2>{lesson.title}</h2>
        <span className="training-lesson__type">{lessonTypeLabel}</span>
        <div className="training-lesson__bar">
          <span className="training-lesson__bar-stat">{lesson.minWpm} WPM</span>
          <span className="training-lesson__bar-divider" aria-hidden="true" />
          <span className="training-lesson__bar-stat">{lesson.minAccuracy}% accuracy</span>
          <span className="training-lesson__bar-divider" aria-hidden="true" />
          <span className="training-lesson__bar-stat">{Math.max(1, Math.round((Number(lesson.duration) || 60) / 60))} min</span>
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

      <section className="training-lesson__objective" aria-labelledby="lesson-objective-title">
        <div>
          <span className="training-eyebrow">Lesson objective</span>
          <h3 id="lesson-objective-title">{lessonObjective}</h3>
        </div>
        <p>Pass this lesson by reaching at least <strong>{lesson.minWpm} WPM</strong> and <strong>{lesson.minAccuracy}% accuracy</strong>.</p>
      </section>

      {lesson.lessonType === 'intro' && (
        <section className="training-beginner-guide" aria-labelledby="beginner-guide-title">
          <div>
            <span className="training-eyebrow">Start here</span>
            <h3 id="beginner-guide-title">Your hands are learning a new map</h3>
            <p>Speed can wait. Build the habit of returning to the home row after every key.</p>
          </div>
          <div className="training-beginner-guide__grid">
            <div><strong>1. Sit comfortably</strong><span>Feet supported, shoulders loose, elbows near your sides, wrists level rather than pressed into the desk.</span></div>
            <div><strong>2. Find home row</strong><span>Left fingers rest on A S D F. Right fingers rest on J K L ;. The small bumps on F and J help you reset without looking.</span></div>
            <div><strong>3. Use the right finger</strong><span>Move only the finger reaching for a key, then return it home. Your thumbs share the space bar.</span></div>
            <div><strong>4. Try it now</strong><span>Place both index fingers on F and J, look at the passage, and type slowly enough to keep every character correct.</span></div>
          </div>
        </section>
      )}

      {!outcome && (
        <>
          <div className="training-keyboard-toggle">
            <label><input type="checkbox" checked={showKeyboard} onChange={(event) => setShowKeyboard(event.target.checked)} /> Show keyboard guide</label>
            <span>Use it while learning, hide it when you want no-look practice.</span>
          </div>
          {showKeyboard && <PlayKeyboardDeck phase="racing" normalizeKeyboardKey={(key) => (key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)} expectedKey={expectedKey} />}
          {liveStats && (
            <p className="training-lesson__live-stats" aria-live="polite">
              {Math.round(liveStats.wpm)} WPM · {Math.round(liveStats.accuracy)}% accuracy so far
            </p>
          )}
          {attemptError && <p className="training-lesson__error" role="alert">{attemptError}</p>}
          {lesson.id !== 'problem-keys' && !attempt && !attemptError && (
            <p className="training-lesson__preparing" role="status">Preparing your secure lesson attempt...</p>
          )}
          <TypingBox
            targetText={targetText}
            typedText={typedText}
            onChange={handleChange}
            inputRef={inputRef}
            disabled={finished || (lesson.id !== 'problem-keys' && !attempt)}
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
