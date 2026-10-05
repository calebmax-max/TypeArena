import React from 'react';
import { getCourseSummary } from './trainingProgress';

export default function CourseDashboard({ progress, lessons, onContinue }) {
  const summary = getCourseSummary(progress, lessons);

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
      <div className="training-course-dashboard__meta">
        <span><strong>{summary.totalXp}</strong> XP earned</span>
        <span>Pass targets require both speed and accuracy</span>
        <button type="button" className="training-button" onClick={() => onContinue(summary.currentLesson?.id)}>
          {summary.completed ? 'Review final lesson' : 'Continue course'}
        </button>
      </div>
    </section>
  );
}
