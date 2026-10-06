import React from 'react';
import { Link } from 'react-router-dom';
import { getCourseSummary, isLessonPassed } from './trainingProgress';

export default function CourseDashboard({ progress, courses = [], lessons, problemKeys = [], onContinue, onProblemPractice, onPlacement, onPurchase }) {
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
  const featuredCourse = coursePathway.find((course) => course.lessons.some((lesson) => String(lesson.id) === String(summary.currentLesson?.id)))
    || coursePathway.find((course) => !course.isLocked)
    || coursePathway[0];

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
      {featuredCourse && <section className="training-course-outcome" aria-labelledby="course-outcome-title">
        <div className="training-course-outcome__heading">
          <div>
            <span className="training-eyebrow">What this course delivers</span>
            <h2 id="course-outcome-title">{featuredCourse.title}</h2>
          </div>
          <span>{featuredCourse.skill_level || 'All levels'} · {featuredCourse.expected_duration || 'Self-paced'}</span>
        </div>
        <div className="training-course-outcome__grid">
          <div><strong>Target</strong><span>{featuredCourse.target_skill || featuredCourse.stage_focus || 'Build reliable typing ability'}</span></div>
          <div><strong>Practical outcome</strong><span>{featuredCourse.practical_outcome || featuredCourse.description || 'Complete structured keyboard practice with measured progress.'}</span></div>
          <div><strong>Assessment</strong><span>{featuredCourse.assessment_requirements || `${featuredCourse.gate_wpm || 0} WPM and ${featuredCourse.gate_accuracy || 90}% accuracy gate`}</span></div>
          <div><strong>Certificate and work relevance</strong><span>{featuredCourse.certificate_outcome || 'Verified course completion'} · {featuredCourse.job_relevance || 'Typing and digital-work foundations'}</span></div>
        </div>
      </section>}
      <section className={`training-assessment-callout${summary.completed ? ' training-assessment-callout--ready' : ''}`} aria-labelledby="training-assessment-title">
        <div>
          <span className="training-eyebrow">Verified pathway</span>
          <h2 id="training-assessment-title">{summary.completed ? 'Ready to prove your skills?' : 'Your verified assessment comes next'}</h2>
          <p>{summary.completed ? 'Take the verified assessment and create evidence you can share with a school or employer.' : `${Math.max(0, summary.totalLessons - summary.passedLessons)} lesson(s) remain before the verified assessment.`}</p>
        </div>
        {summary.completed ? <Link className="training-button" to="/certification">Take assessment</Link> : <span className="training-assessment-callout__status">Keep practising</span>}
      </section>
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
              {course.isLocked && course.accessReason === 'paid' && (
                <button type="button" className="training-button training-button--quiet" onClick={() => onPurchase?.(course)}>
                  Unlock for KES {Number(course.price || 0).toLocaleString()}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="training-course-dashboard__meta">
        <span><strong>{summary.totalXp}</strong> XP earned</span>
        <span>Pass targets require both speed and accuracy</span>
        <div className="training-course-dashboard__actions">
          <button type="button" className="training-button" onClick={() => onContinue(summary.currentLesson?.id)}>
            {summary.completed ? 'Review final lesson' : 'Continue course'}
          </button>
          {onPlacement && <button type="button" className="training-button training-button--quiet" onClick={onPlacement}>Find my starting point</button>}
        </div>
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
