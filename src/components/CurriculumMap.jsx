import React, { useEffect, useRef, useState } from 'react';
import { UNITS, LESSON_SEQUENCE, requiredPassesFor } from './curriculum';
import { isLessonPassed, isLessonUnlocked } from './trainingProgress';

function lessonStatus(progress, lesson, currentLessonId) {
  if (isLessonPassed(progress, lesson)) return 'passed';
  if (lesson.id === currentLessonId) return 'current';
  if (isLessonUnlocked(progress, lesson, LESSON_SEQUENCE)) return 'unlocked';
  return 'locked';
}

// On wide screens the lesson list is always visible. On phones (see the media
// query in Training.css) it collapses into a dropdown button that shows the
// lesson you're on, so the typing area gets the whole screen.
export default function CurriculumMap({ progress, currentLessonId, activeLessonId, onSelectLesson }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const shownLesson =
    LESSON_SEQUENCE.find((lesson) => lesson.id === (activeLessonId || currentLessonId)) ||
    LESSON_SEQUENCE[0];
  const passedCount = LESSON_SEQUENCE.filter((lesson) => isLessonPassed(progress, lesson)).length;

  // Close on outside tap or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // When the dropdown opens, bring the lesson you're on into view.
  useEffect(() => {
    if (!open || !rootRef.current) return;
    const active = rootRef.current.querySelector('[aria-current="true"]');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }, [open]);

  function handleSelect(lessonId) {
    setOpen(false);
    onSelectLesson(lessonId);
  }

  return (
    <nav className="training-map" aria-label="Training curriculum" ref={rootRef}>
      <button
        type="button"
        className="training-map__toggle"
        aria-expanded={open}
        aria-controls="training-map-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="training-map__toggle-text">
          <span className="training-map__toggle-title">{shownLesson?.title}</span>
          <span className="training-map__toggle-meta">
            {passedCount} of {LESSON_SEQUENCE.length} lessons passed
          </span>
        </span>
        <span
          className={`training-map__toggle-chevron${open ? ' is-open' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div id="training-map-panel" className={`training-map__panel${open ? ' is-open' : ''}`}>
        {UNITS.map((unit) => (
          <div key={unit.id} className="training-map__unit">
            <h3 className="training-map__unit-title">{unit.title}</h3>
            <ol className="training-map__lessons">
              {unit.lessons.map((lesson) => {
                const status = lessonStatus(progress, lesson, currentLessonId);
                const required = requiredPassesFor(lesson);
                const state = progress.lessons[lesson.id];
                const passCount = state?.passCount || 0;
                const isShown = lesson.id === shownLesson?.id;
                return (
                  <li key={lesson.id} className={`training-map__lesson training-map__lesson--${status}`}>
                    <button
                      type="button"
                      className="training-map__lesson-button"
                      disabled={status === 'locked'}
                      aria-current={isShown ? 'true' : undefined}
                      onClick={() => handleSelect(lesson.id)}
                    >
                      <span className="training-map__lesson-title">{lesson.title}</span>
                      <span className="training-map__lesson-meta">
                        {status === 'passed' && (required > 1 ? `Passed (${passCount}/${required})` : 'Passed')}
                        {status === 'current' && 'Current'}
                        {status === 'unlocked' && 'Available'}
                        {status === 'locked' && 'Locked'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </nav>
  );
}