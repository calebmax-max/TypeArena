import React from 'react';
import { getCourseSummary, isLessonPassed } from './trainingProgress';

export default function CourseDashboard({ progress, courses = [], lessons, problemKeys = [], onContinue, onProblemPractice }) {
  const summary = getCourseSummary(progress, lessons);
  const coursePathway = courses.map((course, index) => {
    const courseLessons = course.lessons || [];
    const passed = courseLessons.filter((lesson) => isLessonPassed(progress, lesson)).length;
    return {
      ...course,
      stage: Number(course.stage_number || course.stageNumber || index + 1),
      passed,
      total: courseLessons.length,
      percentage: courseLessons.length ? Math.round((passed / courseLessons.length) * 100) : 0,
    };
  });

  return (
    <section className="training-course-dashboard" aria-labelledby="beginner-course-title">
      <div className="training-course-dashboard__intro">
        <div>
          <p className="training-eyebrow">Structured course</p>
          <h1 id="beginner-course-title">Beginner Typing</h1>
          <p>Build clean touch-typing habits from the home row to fluent sentences.</p>
        </div>
        <div className="training-course-dashboard__progress" aria-label={`${summary.percentage}% complete`}>
          <strong>{summary.percentage}%</strong>
          <span>{summary.passedLessons}/{summary.totalLessons} lessons</span>
        </div>
      </div>
      <div className="training-course-dashboard__track" aria-hidden="true">
        <span style={{ width: `${summary.percentage}%` }} />
      </div>
      <div className="training-pathway" aria-labelledby="training-pathway-title">
        <div className="training-pathway__heading">
          <div>
            <p className="training-eyebrow">Your learning pathway</p>
            <h2 id="training-pathway-title">Progress by stage</h2>
          </div>
          <span>Complete each stage to build a reliable foundation.</span>
        </div>
        <div className="training-pathway__grid">
          {coursePathway.map((course) => (
            <div className={`training-stage-card${course.isLocked ? ' training-stage-card--locked' : ''}`} key={course.id}>
              <span className="training-stage-card__number">Stage {course.stage}</span>
              <strong>{course.title}</strong>
              <span>{course.stage_focus || course.stageFocus || 'Guided typing practice'}</span>
              <div className="training-stage-card__progress" aria-label={`${course.percentage}% complete`}>
                <span style={{ width: `${course.percentage}%` }} />
              </div>
              <small>{course.isLocked ? 'Unlock after the previous stage' : `${course.passed}/${course.total} lessons complete`}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="training-course-dashboard__meta">
        <span><strong>{summary.totalXp}</strong> XP earned</span>
        <span>Pass targets require both speed and accuracy</span>
        <button type="button" className="training-button" onClick={() => onContinue(summary.currentLesson?.id)}>
          {summary.completed ? 'Review final lesson' : 'Continue course'}
        </button>
      </div>
      <details className="training-hand-guide">
        <summary>Beginner hand and posture guide</summary>
        <div className="training-hand-guide__content">
          <p>Rest your fingers lightly on the home row. Keep your wrists level, shoulders relaxed, and look at the screen instead of the keys.</p>
          <div className="training-hand-guide__columns">
            <div><strong>Left hand</strong><span>A → left pinky</span><span>S → left ring</span><span>D → left middle</span><span>F → left index</span></div>
            <div><strong>Right hand</strong><span>J → right index</span><span>K → right middle</span><span>L → right ring</span><span>; → right pinky</span></div>
          </div>
          <small>Use both thumbs for the space bar. Move only the finger assigned to each key and return to the home row after every reach.</small>
        </div>
      </details>
      <div className="training-problem-keys">
        <div><strong>Problem-key practice</strong><span>{problemKeys.length ? `Focus on ${problemKeys.map((item) => item.key).join(', ')}` : 'Complete a lesson to discover your weakest keys.'}</span></div>
        {problemKeys.length > 0 && <button type="button" className="training-button training-button--quiet" onClick={onProblemPractice}>Practice weak keys</button>}
      </div>
    </section>
  );
}
