import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchPublicSkillsPassport } from '../utils/typingApi';
import './SkillsPassport.css';

const formatDate = (value) => value ? new Date(value).toLocaleDateString() : 'Not recorded';

export default function SkillsPassport() {
  const { shareCode } = useParams();
  const [passport, setPassport] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchPublicSkillsPassport(shareCode)
      .then((result) => { if (active) setPassport(result.passport); })
      .catch((requestError) => { if (active) setError(requestError.message || 'This skills passport is unavailable.'); });
    return () => { active = false; };
  }, [shareCode]);

  if (error) return <main className="skills-passport-page"><section className="skills-passport-state"><h1>Skills passport unavailable</h1><p>{error}</p><Link to="/" className="skills-passport-button">Return to TypeArena</Link></section></main>;
  if (!passport) return <main className="skills-passport-page"><section className="skills-passport-state"><p>Loading verified skills record...</p></section></main>;

  return (
    <main className="skills-passport-page">
      <section className="skills-passport-card">
        <div className="skills-passport-header"><div><span className="skills-passport-eyebrow">TypeArena Skills Passport</span><h1>{passport.learnerName}</h1><p>{passport.profileStatement}</p></div><span className="skills-passport-status">{passport.confidenceLevel}</span></div>
        <div className="skills-passport-stats"><div><strong>{passport.verifiedWpm ?? '—'}</strong><span>Best passed WPM</span></div><div><strong>{passport.verifiedAccuracy ? `${passport.verifiedAccuracy}%` : '—'}</strong><span>Best passed accuracy</span></div><div><strong>{passport.assessments?.length || 0}</strong><span>Verified assessments</span></div><div><strong>{passport.certificates?.length || 0}</strong><span>Certificates</span></div></div>
        <p className="skills-passport-date">Last recorded assessment: {formatDate(passport.lastAssessmentDate)}</p>

        <section className="skills-passport-section"><h2>Course evidence</h2>{passport.courses?.length ? passport.courses.map((course) => <article className="skills-passport-course" key={course.courseId}><div><strong>{course.title}</strong><span>{course.completed ? 'Completed' : `${course.lessonsPassed}/${course.lessonsTotal} lessons passed`}{course.duration ? ` · ${course.duration}` : ''}</span></div><p>{course.practicalOutcome || 'Structured typing and digital skills practice.'}</p><small>Last activity: {formatDate(course.lastActivity)}</small></article>) : <p>No course evidence recorded yet.</p>}</section>
        <section className="skills-passport-section"><h2>Verified assessments</h2>{passport.assessments?.length ? passport.assessments.map((assessment) => <article className="skills-passport-assessment" key={assessment.assessmentId}><strong>{assessment.wpm} WPM</strong><span>{assessment.accuracy}% accuracy · {formatDate(assessment.assessmentDate)}</span><em>Verified</em></article>) : <p>No verified assessment has been completed yet.</p>}</section>
        {passport.certificates?.length > 0 && <section className="skills-passport-section"><h2>Certificates</h2>{passport.certificates.map((certificate) => <a className="skills-passport-certificate" key={certificate.certificateId} href={certificate.verificationUrl}><strong>{certificate.courseTitle}</strong><span>{certificate.certificateId} · issued {formatDate(certificate.issuedAt)}</span></a>)}</section>}
        <footer className="skills-passport-footer">Verification code: {passport.shareCode} · Evidence supplied by TypeArena</footer>
      </section>
    </main>
  );
}
