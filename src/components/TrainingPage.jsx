import React, { useEffect, useMemo, useState } from 'react';
import CurriculumMap from './CurriculumMap';
import LessonRunner from './LessonRunner';
import CourseDashboard from './CourseDashboard';
import { fetchTrainingCourses, fetchTrainingProblemKeys, fetchTrainingProgress } from '../utils/typingApi';
import { flattenLessons, getLessonById, getNextLessonId, normalizeCourseResponse } from './trainingContent';
import {
  loadProgress,
  setCurrentLesson,
  getCurrentLessonId,
  applyServerProgress,
  flushQueuedTrainingEvents,
} from './trainingProgress';
import './Training.css';

export default function TrainingPage() {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [problemKeys, setProblemKeys] = useState([]);
  const [progress, setProgress] = useState(loadProgress());
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [justCertified, setJustCertified] = useState(false);

  const lessons = useMemo(() => flattenLessons(courses), [courses]);

  useEffect(() => {
    (async () => {
      await flushQueuedTrainingEvents();
      const [payload, problemPayload, progressPayload] = await Promise.all([fetchTrainingCourses(), fetchTrainingProblemKeys(), fetchTrainingProgress()]);
      const hydrated = applyServerProgress(progressPayload);
      setProgress(hydrated);
      setCourses(normalizeCourseResponse(payload));
      setProblemKeys(Array.isArray(problemPayload?.keys) ? problemPayload.keys : []);
    })()
      .catch((err) => setError(err.message || 'Could not load training courses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (lessons.length) {
      const id = getCurrentLessonId(lessons);
      setActiveLessonId(id);
    }
  }, [lessons]);

  function refreshProgress() {
    setProgress(loadProgress());
  }

  function handleSelectLesson(lessonId) {
    setJustCertified(false);
    setActiveLessonId(lessonId);
  }

  function handleLessonPassed(lessonId) {
    if (lessonId === 'problem-keys') {
      setActiveLessonId(getCurrentLessonId(lessons));
      refreshProgress();
      return;
    }
    const nextId = getNextLessonId(lessons, lessonId);
    if (nextId) {
      setCurrentLesson(nextId);
      setActiveLessonId(nextId);
    } else {
      // Passed the very last lesson in the sequence (all required passes
      // complete). Nowhere further to advance to, so stay on this lesson
      // but show a dedicated finished screen instead of silently returning
      // to "Select a lesson to begin."
      setCurrentLesson(lessonId);
      setJustCertified(true);
    }
    refreshProgress();
  }

  if (loading) return <div className="training-page"><p>Loading courses...</p></div>;
  if (error) return (
    <div className="training-page">
      <section className="training-state-card training-state-card--error" role="alert">
        <span className="training-state-card__eyebrow">Training unavailable</span>
        <h1>We couldn’t load your courses</h1>
        <p>{error}</p>
        <p className="training-state-card__hint">Please try again. If this continues, the training database needs attention on the server.</p>
        <button type="button" className="training-button" onClick={() => window.location.reload()}>Try again</button>
      </section>
    </div>
  );
  if (!lessons.length) return (
    <div className="training-page">
      <section className="training-state-card" role="status">
        <span className="training-state-card__eyebrow">No published content</span>
        <h1>Training is being prepared</h1>
        <p>An admin needs to publish a course before lessons appear here.</p>
      </section>
    </div>
  );

  const activeLesson = activeLessonId ? getLessonById(lessons, activeLessonId) : null;
  const problemLesson = { id: 'problem-keys', unitId: 'adaptive', title: 'Problem-key practice', content: problemKeys.map((item) => `${item.key} ${item.key} ${item.key}`).join(' '), minWpm: 10, minAccuracy: 90, lessonType: 'challenge', requiredPasses: 1 };
  const displayedLesson = activeLessonId === 'problem-keys' ? problemLesson : activeLesson;
  const currentLessonId = getCurrentLessonId(lessons);

  return (
    <div className="training-page training-page--curriculum">
      <div className="training-page__course-header">
        <CourseDashboard
          progress={progress}
          lessons={lessons}
          problemKeys={problemKeys}
          onContinue={(lessonId) => lessonId && handleSelectLesson(lessonId)}
          onProblemPractice={() => { setJustCertified(false); setActiveLessonId('problem-keys'); }}
        />
      </div>
      <aside className="training-page__sidebar">
        <CurriculumMap
          progress={progress}
          courses={courses}
          lessons={lessons}
          currentLessonId={currentLessonId}
          activeLessonId={activeLessonId}
          onSelectLesson={handleSelectLesson}
        />
      </aside>
      <main className="training-page__main">
        {justCertified ? (
          <div className="training-certified">
            <h2>Training complete</h2>
            <p>
              You cleared every lesson in the curriculum, finishing with{' '}
              {activeLesson?.title || 'the final lesson'}.
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
        ) : displayedLesson ? (
          <LessonRunner
            key={displayedLesson.id}
            lesson={displayedLesson}
            onLessonPassed={handleLessonPassed}
          />
        ) : (
          <p>Select a lesson to begin.</p>
        )}
      </main>
    </div>
  );
}
