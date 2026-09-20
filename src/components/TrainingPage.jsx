import React, { useEffect, useState } from 'react';
import PlacementTest from './PlacementTest';
import CurriculumMap from './CurriculumMap';
import LessonRunner from './LessonRunner';
import { getLessonById, getNextLessonId, LESSON_SEQUENCE } from './curriculum';
import {
  isPlacementDone,
  loadProgress,
  setCurrentLesson,
  getCurrentLessonId,
  flushQueuedTrainingEvents,
} from './trainingProgress';
import './Training.css';

export default function TrainingPage() {
  const [placed, setPlaced] = useState(isPlacementDone());
  const [progress, setProgress] = useState(loadProgress());
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [justCertified, setJustCertified] = useState(false);

  useEffect(() => {
    flushQueuedTrainingEvents();
  }, []);

  useEffect(() => {
    if (placed) {
      const id = getCurrentLessonId(LESSON_SEQUENCE);
      setActiveLessonId(id);
    }
  }, [placed]);

  function refreshProgress() {
    setProgress(loadProgress());
  }

  function handlePlaced(startLessonId) {
    setPlaced(true);
    refreshProgress();
    setActiveLessonId(startLessonId);
  }

  function handleSelectLesson(lessonId) {
    setJustCertified(false);
    setActiveLessonId(lessonId);
  }

  function handleLessonPassed(lessonId) {
    const nextId = getNextLessonId(lessonId);
    if (nextId) {
      setCurrentLesson(nextId);
      setActiveLessonId(nextId);
    } else {
      // Passed the very last lesson in the sequence (all required passes
      // of Pro Certification complete). Nowhere further to advance to, so
      // stay on this lesson but show a dedicated certified screen instead
      // of silently returning to "Select a lesson to begin."
      setCurrentLesson(lessonId);
      setJustCertified(true);
    }
    refreshProgress();
  }

  if (!placed) {
    return (
      <div className="training-page">
        <PlacementTest onPlaced={handlePlaced} />
      </div>
    );
  }

  const activeLesson = activeLessonId ? getLessonById(activeLessonId) : null;
  const currentLessonId = getCurrentLessonId(LESSON_SEQUENCE);

  return (
    <div className="training-page training-page--curriculum">
      <aside className="training-page__sidebar">
        <CurriculumMap
          progress={progress}
          currentLessonId={currentLessonId}
          activeLessonId={activeLessonId}
          onSelectLesson={handleSelectLesson}
        />
      </aside>
      <main className="training-page__main">
        {justCertified ? (
          <div className="training-certified">
            <h2>You're Pro Certified</h2>
            <p>
              You cleared every required pass of {activeLesson?.title || 'Pro Certification'} at
              the full bar. That's the whole curriculum, start to finish.
            </p>
            <button
              type="button"
              className="training-button"
              onClick={() => {
                setJustCertified(false);
              }}
            >
              Review this lesson again
            </button>
          </div>
        ) : activeLesson ? (
          <LessonRunner
            key={activeLesson.id}
            lesson={activeLesson}
            onLessonPassed={handleLessonPassed}
          />
        ) : (
          <p>Select a lesson to begin.</p>
        )}
      </main>
    </div>
  );
}