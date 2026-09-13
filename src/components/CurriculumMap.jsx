import React from 'react';
import { UNITS, LESSON_SEQUENCE, requiredPassesFor } from './curriculum';
import { isLessonPassed, isLessonUnlocked } from './trainingProgress';

function lessonStatus(progress, lesson, currentLessonId) {
  if (isLessonPassed(progress, lesson)) return 'passed';
  if (lesson.id === currentLessonId) return 'current';
  if (isLessonUnlocked(progress, lesson, LESSON_SEQUENCE)) return 'unlocked';
  return 'locked';
}

export default function CurriculumMap({ progress, currentLessonId, onSelectLesson }) {
  return (
    <nav className="training-map" aria-label="Training curriculum">
      {UNITS.map((unit) => (
        <div key={unit.id} className="training-map__unit">
          <h3 className="training-map__unit-title">{unit.title}</h3>
          <ol className="training-map__lessons">
            {unit.lessons.map((lesson) => {
              const status = lessonStatus(progress, lesson, currentLessonId);
              const required = requiredPassesFor(lesson);
              const state = progress.lessons[lesson.id];
              const passCount = state?.passCount || 0;
              return (
                <li key={lesson.id} className={`training-map__lesson training-map__lesson--${status}`}>
                  <button
                    type="button"
                    className="training-map__lesson-button"
                    disabled={status === 'locked'}
                    onClick={() => onSelectLesson(lesson.id)}
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
    </nav>
  );
}