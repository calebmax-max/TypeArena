import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchTrainingCourses, fetchTrainingProgress } from '../utils/typingApi';
import './AppDashboard.css';

const actions = [
  { href: '/training', icon: '01', title: 'Continue training', text: 'Build speed and accuracy through structured lessons.' },
  { href: '/play', icon: '02', title: 'Practice now', text: 'Start a focused typing session or race.' },
  { href: '/tasks', icon: '03', title: 'Open Skills Lab', text: 'Apply your skills to realistic work tasks.' },
  { href: '/school', icon: '04', title: 'School mode', text: 'Manage classes, learners, and assignments.' },
];

export default function AppDashboard({ currentUser }) {
  const [courses, setCourses] = useState([]);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([fetchTrainingCourses().catch(() => ({ courses: [] })), fetchTrainingProgress().catch(() => null)])
      .then(([courseData, progressData]) => {
        if (!active) return;
        setCourses(Array.isArray(courseData?.courses) ? courseData.courses : []);
        setProgress(progressData);
      });
    return () => { active = false; };
  }, []);

  const totalLessons = courses.reduce((sum, course) => sum + Number(course.progress?.totalLessons || course.lessons?.length || 0), 0);
  const passedLessons = courses.reduce((sum, course) => sum + Number(course.progress?.passedLessons || 0), 0);
  const currentCourse = courses.find((course) => !course.isLocked && !course.completed) || courses.find((course) => !course.isLocked);
  const currentLesson = currentCourse?.lessons?.find((lesson) => !progress?.lessons?.[String(lesson.id)]?.passCount) || currentCourse?.lessons?.[0];
  const completion = totalLessons ? Math.round((passedLessons / totalLessons) * 100) : 0;
  const firstName = String(currentUser?.name || currentUser?.username || 'learner').split(' ')[0];
  const stats = useMemo(() => [
    { label: 'Training progress', value: `${completion}%`, detail: `${passedLessons} of ${totalLessons || 0} lessons` },
    { label: 'XP earned', value: Number(progress?.totalXp || 0).toLocaleString(), detail: 'Keep your momentum' },
    { label: 'Current level', value: currentUser?.level || '1', detail: 'Earn XP to level up' },
  ], [completion, currentUser?.level, passedLessons, progress?.totalXp, totalLessons]);

  return (
    <main className="app-dashboard">
      <section className="app-dashboard__hero">
        <div className="app-dashboard__hero-copy">
          <span className="app-dashboard__eyebrow">Your TypeArena workspace</span>
          <h1>Good to see you, {firstName}.</h1>
          <p>Build practical digital confidence, measure your progress, and prove what you can do.</p>
          <div className="app-dashboard__hero-actions">
            <Link className="app-dashboard__primary" to={currentLesson ? `/training?lessonId=${currentLesson.id}` : '/training'}>Continue learning <span>→</span></Link>
            <Link className="app-dashboard__secondary" to="/profile">View profile</Link>
          </div>
        </div>
        <div className="app-dashboard__hero-art" aria-label="TypeArena learning workspace illustration">
          <div className="app-dashboard__orb app-dashboard__orb--one" />
          <div className="app-dashboard__orb app-dashboard__orb--two" />
          <div className="app-dashboard__keyboard"><span>Q</span><span>W</span><span>E</span><span>R</span><span>T</span><span>Y</span><span>U</span><span>I</span><span>O</span><span>P</span><span>A</span><span>S</span><span>D</span><span>F</span><span>J</span><span>K</span><span>L</span><span>;</span></div>
          <div className="app-dashboard__hero-badge"><strong>{completion}%</strong><span>pathway complete</span></div>
        </div>
      </section>

      <section className="app-dashboard__stats" aria-label="Your progress summary">
        {stats.map((stat) => <div className="app-dashboard__stat" key={stat.label}><span>{stat.label}</span><strong>{stat.value}</strong><small>{stat.detail}</small></div>)}
      </section>

      <section className="app-dashboard__section">
        <div className="app-dashboard__section-heading"><div><span className="app-dashboard__eyebrow">Choose your next move</span><h2>Make progress that matters</h2></div><span className="app-dashboard__section-note">Everything in one place</span></div>
        <div className="app-dashboard__actions">{actions.map((action) => <Link to={action.href} className="app-dashboard__action" key={action.href}><span className="app-dashboard__action-icon">{action.icon}</span><span><strong>{action.title}</strong><small>{action.text}</small></span><b>→</b></Link>)}</div>
      </section>

      <section className="app-dashboard__lower-grid">
        <div className="app-dashboard__panel app-dashboard__panel--pathway"><div className="app-dashboard__panel-heading"><div><span className="app-dashboard__eyebrow">Learning pathway</span><h2>{currentCourse?.title || 'Start your typing pathway'}</h2></div><Link to="/training">View all</Link></div><div className="app-dashboard__progress-line"><span style={{ width: `${completion}%` }} /></div><p>{currentLesson ? `Next up: ${currentLesson.title}` : 'Choose Training to begin your first measured lesson.'}</p><Link className="app-dashboard__panel-button" to="/training">Open training</Link></div>
        <div className="app-dashboard__panel app-dashboard__panel--proof"><span className="app-dashboard__eyebrow">Proof of progress</span><h2>Turn practice into opportunity</h2><p>Complete Skills Lab tasks and verified assessments to build evidence for schools and employers.</p><div className="app-dashboard__proof-links"><Link to="/tasks">Skills Lab <span>→</span></Link><Link to="/certification">Get certified <span>→</span></Link></div></div>
      </section>
    </main>
  );
}
