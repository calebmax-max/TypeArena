import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CurriculumMap from './CurriculumMap';
import LessonRunner from './LessonRunner';
import CourseDashboard from './CourseDashboard';
import PlacementTest from './PlacementTest';
import { fetchTrainingCourses, fetchTrainingProblemKeys, fetchTrainingProgress, purchaseTrainingCourse } from '../utils/typingApi';
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
  const [showPlacement, setShowPlacement] = useState(false);
  const [stageComplete, setStageComplete] = useState(null);
  const [purchaseError, setPurchaseError] = useState('');
  const [purchasingCourseId, setPurchasingCourseId] = useState(null);

  const lessons = useMemo(() => flattenLessons(courses), [courses]);

  useEffect(() => {
    (async () => {
      // Do not make the learner wait for an old offline-event queue to flush
      // before showing the curriculum. It is background synchronization.
      flushQueuedTrainingEvents().catch(() => {});
      const [payload, progressPayload] = await Promise.all([fetchTrainingCourses(), fetchTrainingProgress()]);
      const hydrated = applyServerProgress(progressPayload);
      setProgress(hydrated);
      setCourses(normalizeCourseResponse(payload));
      fetchTrainingProblemKeys()
        .then((problemPayload) => setProblemKeys(Array.isArray(problemPayload?.keys) ? problemPayload.keys : []))
        .catch(() => setProblemKeys([]));
    })()
      .catch((err) => setError(err.message || 'Could not load training courses.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (lessons.length) {
      const requestedCourseId = new URLSearchParams(window.location.search).get('courseId');
      const requestedCourse = requestedCourseId && courses.find((course) => String(course.id) === String(requestedCourseId));
      const id = requestedCourse?.lessons?.[0]?.id || getCurrentLessonId(lessons);
      setActiveLessonId(id);
    }
  }, [courses, lessons]);

  function refreshProgress() {
    setProgress(loadProgress());
  }

  function handleSelectLesson(lessonId) {
    setJustCertified(false);
    setStageComplete(null);
    setActiveLessonId(lessonId);
  }

  function handlePlacementComplete(startLessonId) {
    setCurrentLesson(startLessonId);
    setShowPlacement(false);
    setJustCertified(false);
    setActiveLessonId(startLessonId);
    refreshProgress();
  }

  async function handleLessonPassed(lessonId) {
    if (lessonId === 'problem-keys') {
      setActiveLessonId(getCurrentLessonId(lessons));
      refreshProgress();
      return;
    }
    let nextLessons = lessons;
    let nextCourseList = courses;
    try {
      const refreshed = normalizeCourseResponse(await fetchTrainingCourses());
      setCourses(refreshed);
      nextCourseList = refreshed;
      nextLessons = flattenLessons(refreshed);
    } catch {
      // The attempt is already saved; retain the current map if a refresh is
      // temporarily unavailable and let the next page load reconcile it.
    }
    const nextId = getNextLessonId(nextLessons, lessonId);
    if (nextId) {
      const currentCourse = nextCourseList.find((course) => course.lessons?.some((lesson) => String(lesson.id) === String(lessonId)));
      const nextCourse = nextCourseList.find((course) => course.lessons?.some((lesson) => String(lesson.id) === String(nextId)));
      setCurrentLesson(nextId);
      setActiveLessonId(nextId);
      if (currentCourse && nextCourse && String(currentCourse.id) !== String(nextCourse.id)) {
        setStageComplete({ title: currentCourse.title, nextId, locked: Boolean(nextCourse.isLocked), nextTitle: nextCourse.title });
      }
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


  async function handlePurchase(course) {
    setPurchaseError('');
    setPurchasingCourseId(course.id);
    try {
      await purchaseTrainingCourse(course.id);
      const [payload, progressPayload] = await Promise.all([fetchTrainingCourses(), fetchTrainingProgress()]);
      setCourses(normalizeCourseResponse(payload));
      setProgress(applyServerProgress(progressPayload));
    } catch (purchaseFailure) {
      setPurchaseError(purchaseFailure.message || 'Could not unlock this course.');
    } finally {
      setPurchasingCourseId(null);
    }
  }

  if (loading) return <div className="training-page training-page--loading" role="status" aria-live="polite"><div className="training-loading-card"><span className="training-eyebrow">Your learning pathway</span><h1>Loading courses</h1><p>Preparing your lessons and progress...</p><span className="training-loading-card__bar" aria-hidden="true" /></div></div>;
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
  const problemWords = {
    q: 'quiet quick queen', w: 'water work away', e: 'every learn week', r: 'reader river ready',
    t: 'type start steady', y: 'your rhythm young', u: 'use true useful', i: 'inside simple input',
    o: 'good room smooth', p: 'practice people proper', a: 'again data calm', s: 'steady skills same',
    d: 'daily design idea', f: 'focus finish safe', g: 'good typing goal', h: 'home rhythm with',
    j: 'just join adjust', k: 'keep key skill', l: 'learn level well', z: 'zero zone lazy',
    x: 'exact extra text', c: 'clean accuracy focus', v: 'every value move', b: 'build better habit',
    n: 'nice rhythm now', m: 'more time improve', ';': 'class lesson; practice;',
  };
  const problemLesson = { id: 'problem-keys', unitId: 'adaptive', title: 'Problem-key practice', content: problemKeys.map((item) => problemWords[item.key.toLowerCase()] || `${item.key} practice`).join(' '), minWpm: 10, minAccuracy: 90, lessonType: 'challenge', requiredPasses: 1 };
  const displayedLesson = activeLessonId === 'problem-keys' ? problemLesson : activeLesson;
  const currentLessonId = getCurrentLessonId(lessons);

  return (
    <div className="training-page training-page--curriculum">
      <div className="training-page__course-header">
        {purchaseError && <p className="training-lesson__error" role="alert">{purchaseError}</p>}
        <CourseDashboard
          progress={progress}
          courses={courses}
          lessons={lessons}
          problemKeys={problemKeys}
          onContinue={(lessonId) => lessonId && handleSelectLesson(lessonId)}
          onProblemPractice={() => { setJustCertified(false); setActiveLessonId('problem-keys'); }}
          onPlacement={() => { setJustCertified(false); setShowPlacement(true); }}
          onPurchase={purchasingCourseId ? undefined : handlePurchase}
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
        {showPlacement ? (
          <PlacementTest lessons={lessons} onComplete={handlePlacementComplete} onCancel={() => setShowPlacement(false)} />
        ) : stageComplete ? (
          <div className="training-certified">
            <span className="training-eyebrow">Stage complete</span>
            <h2>You passed {stageComplete.title}</h2>
            <p>{stageComplete.locked ? `Your next stage, ${stageComplete.nextTitle}, is locked. Unlock it from the pathway above when you are ready.` : 'Your lessons are saved to your account. The next stage is now ready when you are.'}</p>
            {!stageComplete.locked && <button type="button" className="training-button" onClick={() => { setStageComplete(null); setActiveLessonId(stageComplete.nextId); }}>Start next stage</button>}
            {stageComplete.locked && <button type="button" className="training-button training-button--quiet" onClick={() => setStageComplete(null)}>View pathway</button>}
          </div>
        ) : justCertified ? (
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
            <Link className="training-button training-button--quiet" to="/certification">Take certification exam</Link>
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
