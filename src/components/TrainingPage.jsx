import React, { useEffect, useState } from 'react';
import PlacementTest from '../PlacementTest';
import CurriculumMap from '../CurriculumMap';
import LessonRunner from '../LessonRunner';
import { getLessonById, getNextLessonId, LESSON_SEQUENCE } from '../curriculum';
import {
  isPlacementDone,
  loadProgress,
  setCurrentLesson,
  getCurrentLessonId,
  flushQueuedTrainingEvents,
} from '../trainingProgress';
import './Training.css';

export default function TrainingPage() {
  const [placed, setPlaced] = useState(isPlacementDone());
  const [progress, setProgress] = useState(loadProgress());
  const [activeLessonId, setActiveLessonId] = useState(null);

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
    setActiveLessonId(lessonId);
  }

  function handleLessonPassed(lessonId) {
    const nextId = getNextLessonId(lessonId);
    if (nextId) {
      setCurrentLesson(nextId);
      setActiveLessonId(nextId);
    } else {
      // Passed the very last lesson in the sequence (all required passes
      // of Pro Certification complete).
      setCurrentLesson(lessonId);
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
          onSelectLesson={handleSelectLesson}
        />
      </aside>
      <main className="training-page__main">
        {activeLesson ? (
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