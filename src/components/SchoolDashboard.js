import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  acceptSchoolInvitation,
  assignSchoolCourse,
  createSchoolAssignment,
  createSchoolClass,
  createSchoolOrganisation,
  createSchoolRace,
  exportSchoolClass,
  fetchSchoolAssignments,
  fetchSchoolClass,
  fetchSchoolClassCurriculum,
  fetchSchoolInvitationsForMe,
  fetchSchoolOrganizationMembers,
  fetchSchoolOverview,
  fetchTrainingCourses,
  importSchoolLearners,
  issueSchoolCourseCertificate,
  inviteSchoolTeacher,
  joinSchoolClass,
  manageSchoolMember,
  regenerateSchoolJoinCode,
  removeSchoolOrganizationMember,
  removeSchoolCourse,
  updateSchoolMemberRole,
  updateSchoolOrganisationSettings,
} from '../utils/typingApi';

const cardStyle = {
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.1)',
  borderRadius: 18,
  padding: 20,
};
const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,.14)',
  background: '#111827',
  color: 'inherit',
  marginBottom: 10,
};
const views = [
  { id: 'overview', label: 'Overview' },
  { id: 'assignments', label: 'Assignments' },
  { id: 'members', label: 'People' },
  { id: 'settings', label: 'Organisation settings' },
];

export default function SchoolDashboard({ currentUser }) {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [organizationMembers, setOrganizationMembers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [notice, setNotice] = useState('');
  const [orgName, setOrgName] = useState('');
  const [className, setClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [assignment, setAssignment] = useState({ title: '', instructions: '', passage: '', targetWpm: '', targetAccuracy: '' });
  const [learnerAssignments, setLearnerAssignments] = useState([]);
  const [trainingCourses, setTrainingCourses] = useState([]);
  const [classCurriculum, setClassCurriculum] = useState(null);
  const [curriculumCourseId, setCurriculumCourseId] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [teacherInvite, setTeacherInvite] = useState('');
  const [schoolRoom, setSchoolRoom] = useState(null);
  const [creatingSchoolRoom, setCreatingSchoolRoom] = useState(false);
  const [activeView, setActiveView] = useState('overview');
  const [learnerFilter, setLearnerFilter] = useState('all');
  const [requireLearnerApproval, setRequireLearnerApproval] = useState(false);
  const fileRef = useRef(null);

  const selectedOrganization = (overview?.organizations || []).find(
    (organization) => String(organization.id) === String(selectedOrganizationId)
  );
  const activeClassLearners = (selected?.learners || []).filter((learner) => learner.status === 'active');
  const learnersNeedingSupport = activeClassLearners.filter((learner) => Number(learner.accuracy) < 90 || Number(learner.wpm) <= 0);
  const learnersReadyForReview = activeClassLearners.filter((learner) => Number(learner.accuracy) >= 90 && Number(learner.wpm) > 0);
  const visibleLearners = learnerFilter === 'support'
    ? learnersNeedingSupport
    : learnerFilter === 'ready'
      ? learnersReadyForReview
      : selected?.learners || [];

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [overviewData, assignmentData, invitationData, trainingData] = await Promise.all([
        fetchSchoolOverview(),
        fetchSchoolAssignments(),
        fetchSchoolInvitationsForMe(),
        fetchTrainingCourses().catch(() => ({ courses: [] })),
      ]);
      setOverview(overviewData);
      setLearnerAssignments(assignmentData.assignments || []);
      setInvitations(invitationData.invitations || []);
      setTrainingCourses(Array.isArray(trainingData?.courses) ? trainingData.courses : []);
      setSelectedOrganizationId((current) => {
        if ((overviewData.organizations || []).some((organization) => String(organization.id) === String(current))) return current;
        return overviewData.organizations?.[0] ? String(overviewData.organizations[0].id) : '';
      });
    } catch (error) {
      setNotice(error.message);
    }
  }, [currentUser?.id]);

  const pathwayCourses = trainingCourses.filter((course) => !course.is_archived).slice(0, 6);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setRequireLearnerApproval(Boolean(selectedOrganization?.settings?.requireLearnerApproval));
  }, [selectedOrganization]);

  const chooseClass = async (id) => {
    try {
      const [classData, curriculumData] = await Promise.all([fetchSchoolClass(id), fetchSchoolClassCurriculum(id)]);
      setSelected(classData);
      setClassCurriculum(curriculumData);
      setLearnerFilter('all');
      setActiveView('overview');
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const refreshMembers = async (organizationId = selectedOrganizationId) => {
    if (!organizationId) {
      setOrganizationMembers([]);
      return;
    }
    const result = await fetchSchoolOrganizationMembers(organizationId);
    setOrganizationMembers(result.members || []);
  };

  const run = async (fn, successMessage = 'Saved.') => {
    try {
      const result = await fn();
      await load();
      if (selected?.class?.id) await chooseClass(selected.class.id);
      setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const refreshCurriculum = async (classId = selected?.class?.id) => {
    if (!classId) return;
    const result = await fetchSchoolClassCurriculum(classId);
    setClassCurriculum(result);
  };

  const assignCourseToClass = async () => {
    if (!selected?.class?.id || !curriculumCourseId) return;
    try {
      await assignSchoolCourse(selected.class.id, curriculumCourseId);
      await refreshCurriculum(selected.class.id);
      setCurriculumCourseId('');
      setNotice('Training course assigned to the class.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const unassignCourseFromClass = async (courseId) => {
    try {
      await removeSchoolCourse(selected.class.id, courseId);
      await refreshCurriculum(selected.class.id);
      setNotice('Training course removed from this class.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const issueCourseCertificate = async (courseId) => {
    try {
      const result = await issueSchoolCourseCertificate(selected.class.id, courseId);
      await refreshCurriculum(selected.class.id);
      setNotice(result.message || 'Course certificate issued.');
    } catch (error) {
      setNotice(error.message);
    }
  };

  const selectOrganization = async (organizationId) => {
    setSelectedOrganizationId(String(organizationId));
    setSelected(null);
    setClassCurriculum(null);
    setCurriculumCourseId('');
    setOrganizationMembers([]);
    if (organizationId) {
      try {
        await refreshMembers(organizationId);
      } catch (error) {
        setNotice(error.message);
      }
    }
  };

  const acceptInvitation = async (token) => {
    await run(async () => {
      await acceptSchoolInvitation(token);
    }, 'Invitation accepted. Your school space has been added.');
  };

  const performMemberAction = async (userId, action) => {
    if (!selected?.class?.id) return;
    await run(async () => {
      await manageSchoolMember(selected.class.id, userId, action);
    }, `Learner ${action}d.`);
  };

  const exportClass = async () => {
    try {
      const blob = await exportSchoolClass(selected.class.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `typearena-class-${selected.class.id}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const startClassRace = async () => {
    if (!selected?.class?.id || creatingSchoolRoom) return;
    setCreatingSchoolRoom(true);
    try {
      const result = await createSchoolRace(selected.class.id);
      if (!result?.room?.id) throw new Error('The class race room was not created. Please try again.');
      navigate(`/play?room=${encodeURIComponent(result.room.id)}&schoolClassId=${encodeURIComponent(selected.class.id)}`);
    } catch (error) {
      setNotice(error.message || 'Could not create the class race room.');
    } finally {
      setCreatingSchoolRoom(false);
    }
  };

  if (!currentUser?.id) {
    return <div className="profile-container"><section className="auth-section"><h1>School mode</h1><p>Sign in first to join a class or create an organisation.</p></section></div>;
  }

  return (
    <div className="profile-container" style={{ maxWidth: 1180, margin: '0 auto', padding: '42px 18px' }}>
      <section className="profile-hero" style={{ marginBottom: 24 }}>
        <span className="eyebrow">TypeArena School</span>
        <h1>Learn. Practise. Demonstrate.</h1>
        <p>A structured pathway for keyboard fluency, computer skills, and verified learner progress.</p>
      </section>
      {notice && <div className="auth-notice" role="status" style={{ marginBottom: 18 }}>{notice}</div>}

      <section style={{ ...cardStyle, marginBottom: 18 }}>
        <span className="eyebrow">Learning pathway</span>
        <h2 style={{ marginTop: 6 }}>Build skills in the right order</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 10 }}>
          {(pathwayCourses.length ? pathwayCourses : [
            { id: 'placeholder-1', stage_number: 1, title: 'Keyboard Foundations', stage_focus: 'Posture, home row, accuracy, and touch-typing confidence.' },
            { id: 'placeholder-2', stage_number: 2, title: 'Computer Essentials', stage_focus: 'Files, devices, internet basics, and digital safety.' },
            { id: 'placeholder-3', stage_number: 3, title: 'Productivity Skills', stage_focus: 'Documents, spreadsheets, communication, and practical tasks.' },
          ]).map((course, index) => (
            <div key={course.id} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)' }}>
              <small style={{ color: '#63cab7', fontWeight: 700 }}>{String(course.stage_number || index + 1).padStart(2, '0')}</small>
              <strong style={{ display: 'block', margin: '6px 0' }}>{course.title}</strong>
              <small style={{ display: 'block', opacity: .72, lineHeight: 1.5 }}>{course.stage_focus || course.description || 'Structured training programme.'}</small>
              {course.lessons?.length > 0 && <small style={{ display: 'block', marginTop: 8, color: '#63cab7' }}>{course.progress?.passedLessons || 0}/{course.progress?.totalLessons || course.lessons.length} lessons passed</small>}
            </div>
          ))}
        </div>
        <Link className="btn btn-primary" style={{ display: 'inline-block', marginTop: 14 }} to="/training">Open training curriculum</Link>
      </section>

      {invitations.length > 0 && (
        <section style={{ ...cardStyle, marginBottom: 18 }}>
          <h2>School invitations</h2>
          {invitations.map((invitation) => (
            <div key={invitation.token} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <span>{invitation.organizationName}{invitation.className ? ` · ${invitation.className}` : ''} · {invitation.role}</span>
              <button className="btn btn-primary" onClick={() => acceptInvitation(invitation.token)}>Accept invitation</button>
            </div>
          ))}
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 18 }}>
        <form style={cardStyle} onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const result = await createSchoolOrganisation(orgName);
            setOrgName('');
            await load();
            if (result?.organization?.id) setSelectedOrganizationId(String(result.organization.id));
          }, 'Organisation created. Select it to create your first class.');
        }}>
          <h2>Create an organisation</h2>
          <p>Start a school or training-centre workspace.</p>
          <input style={inputStyle} value={orgName} onChange={(event) => setOrgName(event.target.value)} placeholder="Organisation name" required minLength={2} maxLength={160} />
          <button className="btn btn-primary" type="submit">Create organisation</button>
        </form>
        <form style={cardStyle} onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const result = await joinSchoolClass(joinCode);
            setJoinCode('');
            return result;
          }, (result) => result?.message || 'Class join request processed.');
        }}>
          <h2>Join a class</h2>
          <p>Use the code shared by your teacher.</p>
          <input style={inputStyle} value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Six-character code" />
          <button className="btn btn-primary" type="submit">Join class</button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.7fr) minmax(320px,1.3fr)', gap: 18, alignItems: 'start' }}>
        <aside style={cardStyle}>
          <h2>Your school spaces</h2>
          {!overview?.organizations?.length && <p>Create an organisation or accept an invitation to get started.</p>}
          {(overview?.organizations || []).map((organization) => (
            <button
              key={organization.id}
              type="button"
              onClick={() => selectOrganization(organization.id)}
              aria-pressed={String(organization.id) === String(selectedOrganizationId)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, margin: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: String(organization.id) === String(selectedOrganizationId) ? 'rgba(99,202,183,.16)' : 'transparent', color: 'inherit' }}
            >
              <strong>{organization.name}</strong>
              <small style={{ display: 'block', opacity: .65 }}>{organization.role}</small>
            </button>
          ))}

          {selectedOrganization && ['org_admin', 'teacher'].includes(selectedOrganization.role) && (
            <form style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.1)' }} onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await createSchoolClass(selectedOrganization.id, className);
                setClassName('');
              }, 'Class created.');
            }}>
              <h3>Create a class</h3>
              <input style={inputStyle} value={className} onChange={(event) => setClassName(event.target.value)} placeholder="Class name" required maxLength={160} />
              <button className="btn btn-secondary" type="submit">Create class</button>
            </form>
          )}

          <h3 style={{ marginTop: 22 }}>Classes</h3>
          {(overview?.classes || [])
            .filter((item) => !selectedOrganizationId || String(item.organizationId) === String(selectedOrganizationId))
            .map((item) => (
              <button key={item.id} type="button" onClick={() => chooseClass(item.id)} aria-pressed={selected?.class?.id === item.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, margin: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: selected?.class?.id === item.id ? 'rgba(99,202,183,.16)' : 'transparent', color: 'inherit' }}>
                {item.name}<small style={{ display: 'block', opacity: .65 }}>{item.learnerCount} learners · code {item.joinCode}</small>
              </button>
            ))}
        </aside>

        <main style={cardStyle}>
          {!selected ? (
            <>
              <h2>{selectedOrganization ? selectedOrganization.name : 'Teacher and learner workspace'}</h2>
              {selectedOrganization && (
                <nav aria-label="Organisation sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0 22px' }}>
                  {views.filter((view) => view.id !== 'assignments').map((view) => (
                    <button key={view.id} type="button" className={activeView === view.id ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={activeView === view.id} onClick={async () => {
                      setActiveView(view.id);
                      if (view.id === 'members') {
                        try { await refreshMembers(selectedOrganization.id); } catch (error) { setNotice(error.message); }
                      }
                    }}>{view.label}</button>
                  ))}
                </nav>
              )}
              {!selectedOrganization && <p>Select an organisation or class to see class progress, assignments, and learner reports.</p>}
              {selectedOrganization && activeView === 'overview' && <p>Select a class to see its progress, or create your first class using the form to the left.</p>}
              {selectedOrganization && activeView === 'members' && (
                <>
                  <h3>Organisation members</h3>
                  {selectedOrganization.role === 'org_admin' && (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        const result = await inviteSchoolTeacher(selectedOrganization.id, teacherEmail);
                        setTeacherInvite(result.invitation?.token || '');
                        setTeacherEmail('');
                      }, 'Teacher invitation created. The invited teacher can accept after signing in with that email.');
                    }}>
                      <input style={inputStyle} type="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} placeholder="teacher@school.org" required />
                      <button className="btn btn-secondary" type="submit">Invite a teacher</button>
                      {teacherInvite && <small style={{ display: 'block', marginTop: 8 }}>Invitation token: <code>{teacherInvite}</code></small>}
                    </form>
                  )}
                  {organizationMembers.map((member) => (
                    <div key={member.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                      <span>{member.username} · {member.email} · {member.role}</span>
                      {selectedOrganization.role === 'org_admin' && <span style={{ display: 'flex', gap: 8 }}>
                        <select aria-label={`Role for ${member.username}`} value={member.role} onChange={async (event) => {
                          try {
                            await updateSchoolMemberRole(selectedOrganization.id, member.id, event.target.value);
                            await refreshMembers(selectedOrganization.id);
                            setNotice('Member role updated.');
                          } catch (error) { setNotice(error.message); }
                        }}>
                          <option value="org_admin">Admin</option><option value="teacher">Teacher</option><option value="learner">Learner</option>
                        </select>
                        <button className="btn btn-secondary" onClick={() => run(async () => {
                          await removeSchoolOrganizationMember(selectedOrganization.id, member.id);
                          await refreshMembers(selectedOrganization.id);
                        }, 'Member removed from the organisation.')}>Remove</button>
                      </span>}
                    </div>
                  ))}
                  {!organizationMembers.length && <p>No members to show.</p>}
                </>
              )}
              {selectedOrganization && activeView === 'settings' && (
                <>
                  <h3>Organisation settings</h3>
                  {selectedOrganization.role === 'org_admin' ? (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      run(() => updateSchoolOrganisationSettings(selectedOrganization.id, { requireLearnerApproval }), 'Organisation settings updated.');
                    }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <input type="checkbox" checked={requireLearnerApproval} onChange={(event) => setRequireLearnerApproval(event.target.checked)} />
                        Require staff approval for learners joining with a class code
                      </label>
                      <button className="btn btn-primary" type="submit">Save settings</button>
                    </form>
                  ) : <p>Only organisation admins can change settings.</p>}
                </>
              )}
              {selectedOrganization && activeView === 'assignments' && <p>Select a class to see assignments.</p>}
              {selectedOrganization && <p style={{ opacity: .7 }}>Practice, public races, and free private rooms remain in the core TypeArena experience.</p>}
            </>
          ) : (
            <>
              <h2>{selected.class.name}</h2>
              <p>{selected.analytics?.learnerCount ?? selected.learners.filter((learner) => learner.status === 'active').length} learners · your role: {selected.role}</p>
              <nav aria-label="School dashboard sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '16px 0 22px' }}>
                {views.map((view) => (
                  <button key={view.id} type="button" className={activeView === view.id ? 'btn btn-primary' : 'btn btn-secondary'} aria-pressed={activeView === view.id} onClick={async () => {
                    setActiveView(view.id);
                    if (view.id === 'members' && selectedOrganization) {
                      try { await refreshMembers(selectedOrganization.id); } catch (error) { setNotice(error.message); }
                    }
                  }}>{view.label}</button>
                ))}
              </nav>

              <section aria-labelledby="class-workflow-title" style={{ marginBottom: 22, padding: 14, borderRadius: 14, border: '1px solid rgba(99,202,183,.22)', background: 'rgba(99,202,183,.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <h3 id="class-workflow-title" style={{ margin: 0 }}>Class learning workflow</h3>
                  <small style={{ opacity: .72 }}>A simple path from assignment to evidence</small>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))', gap: 8, marginTop: 12 }}>
                  {[
                    { number: '01', title: 'Assign a course', detail: classCurriculum?.courses?.length ? `${classCurriculum.courses.length} course(s) assigned` : 'Choose a stage', view: 'overview' },
                    { number: '02', title: 'Learners practise', detail: selected.learners.length ? `${selected.learners.length} learner(s) enrolled` : 'Invite learners', view: 'members' },
                    { number: '03', title: 'Review results', detail: selected.analytics?.completionCount ? `${selected.analytics.completionCount} completion(s)` : 'No results yet', view: 'assignments' },
                    { number: '04', title: 'Issue evidence', detail: 'Certificates and reports', view: 'overview' },
                  ].map((step) => (
                    <button key={step.number} type="button" onClick={() => setActiveView(step.view)} style={{ minHeight: 86, padding: 10, textAlign: 'left', borderRadius: 10, border: activeView === step.view ? '1px solid #63cab7' : '1px solid rgba(255,255,255,.1)', background: activeView === step.view ? 'rgba(99,202,183,.14)' : 'rgba(255,255,255,.03)', color: 'inherit', cursor: 'pointer' }}>
                      <small style={{ color: '#63cab7', fontWeight: 700 }}>{step.number}</small>
                      <strong style={{ display: 'block', margin: '5px 0 3px', fontSize: 13 }}>{step.title}</strong>
                      <small style={{ opacity: .68 }}>{step.detail}</small>
                    </button>
                  ))}
                </div>
              </section>

              {activeView === 'overview' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
                    <div style={cardStyle}><small>Active learners</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.learnerCount ?? selected.learners.length}</strong></div>
                    <div style={cardStyle}><small>Pending approvals</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.pendingCount ?? 0}</strong></div>
                    <div style={cardStyle}><small>Average WPM</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.averageWpm ?? 0}</strong></div>
                    <div style={cardStyle}><small>Average accuracy</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.averageAccuracy ?? 0}%</strong></div>
                    <div style={cardStyle}><small>Completed assignments</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.completionCount ?? 0}</strong></div>
                    <div style={cardStyle}><small>Ready for review</small><strong style={{ display: 'block', fontSize: 24 }}>{learnersReadyForReview.length}</strong></div>
                    <div style={{ ...cardStyle, borderColor: learnersNeedingSupport.length ? 'rgba(245,158,11,.45)' : 'rgba(99,202,183,.22)' }}><small>Needs attention</small><strong style={{ display: 'block', fontSize: 24 }}>{learnersNeedingSupport.length}</strong></div>
                    <div style={cardStyle}><small>Active this week</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.activeThisWeek ?? 0}</strong></div>
                    <div style={cardStyle}><small>Course completion</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.completionRate ?? 0}%</strong></div>
                    <div style={cardStyle}><small>Certificates issued</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.certificatesIssued ?? 0}</strong></div>
                    <div style={cardStyle}><small>Failed assessments</small><strong style={{ display: 'block', fontSize: 24 }}>{selected.analytics?.failedAssessments ?? 0}</strong></div>
                  </div>
                  {['org_admin', 'teacher'].includes(selected.role) && (
                    <section aria-labelledby="support-learners-title" style={{ marginBottom: 20, padding: 14, borderRadius: 12, background: learnersNeedingSupport.length ? 'rgba(245,158,11,.08)' : 'rgba(99,202,183,.06)', border: `1px solid ${learnersNeedingSupport.length ? 'rgba(245,158,11,.28)' : 'rgba(99,202,183,.2)'}` }}>
                      <strong id="support-learners-title">Teaching signal</strong>
                      <p style={{ margin: '5px 0 0', opacity: .78 }}>
                        {learnersNeedingSupport.length
                          ? `${learnersNeedingSupport.length} learner(s) have no recorded result or are below 90% accuracy. Consider assigning a focused practice lesson before assessment.`
                          : 'Every active learner has a recorded result at or above 90% accuracy. Review the detailed results before issuing certificates.'}
                      </p>
                      {learnersNeedingSupport.length > 0 && <small style={{ display: 'block', marginTop: 8, opacity: .72 }}>Learners: {learnersNeedingSupport.map((learner) => learner.username).join(', ')}</small>}
                    </section>
                  )}
                  {['org_admin', 'teacher'].includes(selected.role) && (
                    <div style={{ marginBottom: 20 }}>
                      <h3>Class tools</h3>
                      <button className="btn btn-secondary" onClick={() => run(async () => {
                        const result = await regenerateSchoolJoinCode(selected.class.id);
                        setSelected((value) => ({ ...value, class: { ...value.class, joinCode: result.joinCode } }));
                      }, 'Join code regenerated.')}>Regenerate join code</button>
                      <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={startClassRace} disabled={creatingSchoolRoom}>
                        {creatingSchoolRoom ? 'Creating room...' : 'Start class race'}
                      </button>
                      <button className="btn btn-primary" style={{ marginLeft: 8 }} onClick={async () => {
                        try {
                          const result = await createSchoolRace(selected.class.id);
                          setSchoolRoom(result.room);
                          setNotice(`Class room created. Invite code: ${result.room?.inviteCode || 'ready'}`);
                        } catch (error) {
                          setNotice(error.message);
                        }
                      }}>Create private class race</button>
                      {schoolRoom && <small style={{ display: 'block', margin: '8px 0', opacity: .8 }}>Invite code: <strong>{schoolRoom.inviteCode}</strong>. Only approved classmates and school staff can join.</small>}
                    </div>
                  )}
                  <section style={{ marginBottom: 20 }}>
                    <h3>Class curriculum</h3>
                    {['org_admin', 'teacher'].includes(selected.role) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                        <select style={{ ...inputStyle, maxWidth: 420, marginBottom: 0 }} value={curriculumCourseId} onChange={(event) => setCurriculumCourseId(event.target.value)} aria-label="Training course to assign">
                          <option value="">Choose a training course</option>
                          {trainingCourses.filter((course) => !course.is_archived && !(classCurriculum?.courses || []).some((assigned) => Number(assigned.courseId) === Number(course.id))).map((course) => <option key={course.id} value={course.id}>{course.stage_number ? `Stage ${course.stage_number}: ` : ''}{course.title}</option>)}
                        </select>
                        <button className="btn btn-primary" type="button" onClick={assignCourseToClass} disabled={!curriculumCourseId}>Assign course</button>
                      </div>
                    )}
                    {!classCurriculum?.courses?.length && <p style={{ opacity: .7 }}>No training courses assigned to this class yet.</p>}
                    {(classCurriculum?.courses || []).map((course) => (
                      <div key={course.courseId} style={{ padding: 12, margin: '8px 0', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                          <strong>{course.stageNumber ? `Stage ${course.stageNumber}: ` : ''}{course.title}</strong>
                          {['org_admin', 'teacher'].includes(selected.role) && <button className="btn btn-secondary" type="button" onClick={() => unassignCourseFromClass(course.courseId)}>Remove</button>}
                        </div>
                        <small style={{ display: 'block', opacity: .72 }}>{course.stageFocus || course.description} · {course.totalLessons} lesson(s)</small>
                        {selected.role === 'learner' ? (
                          <>
                            <small style={{ display: 'block', marginTop: 6, color: '#63cab7' }}>{course.progress?.passedLessons || 0}/{course.totalLessons} lessons passed</small>
                            {course.progress?.completed && !course.certificate && <button className="btn btn-primary" type="button" style={{ marginTop: 8 }} onClick={() => issueCourseCertificate(course.courseId)}>Issue course certificate</button>}
                            {course.certificate && <div style={{ marginTop: 8 }}><small style={{ display: 'block', color: '#63cab7' }}>Certificate issued: {course.certificate.certificateId}</small><Link className="btn btn-secondary" style={{ display: 'inline-block', marginTop: 6 }} to={`/verify/${encodeURIComponent(course.certificate.certificateId)}`}>View verification</Link></div>}
                          </>
                        ) : (
                          <div style={{ marginTop: 8 }}>{(course.progress || []).map((learner) => <small key={learner.userId} style={{ display: 'block' }}>{learner.username}: {learner.passedLessons}/{learner.totalLessons} lessons passed · {learner.averageWpm} WPM / {learner.averageAccuracy}%</small>)}</div>
                        )}
                        <Link className="btn btn-primary" style={{ display: 'inline-block', marginTop: 8 }} to={`/training?courseId=${encodeURIComponent(course.courseId)}`}>Open course lessons</Link>
                      </div>
                    ))}
                  </section>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 style={{ marginBottom: 0 }}>Learner progress</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      Show
                      <select value={learnerFilter} onChange={(event) => setLearnerFilter(event.target.value)} aria-label="Filter learners by progress">
                        <option value="all">All learners</option>
                        <option value="support">Needs attention</option>
                        <option value="ready">Ready for review</option>
                      </select>
                    </label>
                  </div>
                  {visibleLearners.length === 0 && <p>{selected.learners.length === 0 ? 'No learners have joined this class yet.' : 'No learners match this filter.'}</p>}
                  {visibleLearners.map((learner) => (
                    <div key={learner.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                      <span>{learner.username} <small style={{ opacity: .65 }}>({learner.status})</small></span>
                      <small style={{ width: '100%', opacity: .68 }}>Training: {learner.training?.passedLessons || 0}/{learner.training?.totalLessons || 0} lessons · last activity {learner.training?.lastActivity ? new Date(learner.training.lastActivity).toLocaleDateString() : 'not recorded'}{learner.training?.weakKeys?.length ? ` · weak keys: ${learner.training.weakKeys.join(', ')}` : ''}</small>
                      <span>{learner.wpm} WPM · {learner.accuracy}%</span>
                      {['org_admin', 'teacher'].includes(selected.role) && (
                        <span style={{ display: 'flex', gap: 6 }}>
                          {learner.status === 'pending' && <button className="btn btn-secondary" onClick={() => performMemberAction(learner.id, 'approve')}>Approve</button>}
                          {learner.status === 'suspended' && <button className="btn btn-secondary" onClick={() => performMemberAction(learner.id, 'restore')}>Restore</button>}
                          {learner.status === 'active' && <button className="btn btn-secondary" onClick={() => performMemberAction(learner.id, 'suspend')}>Suspend</button>}
                          <button className="btn btn-secondary" onClick={() => performMemberAction(learner.id, 'remove')}>Remove</button>
                        </span>
                      )}
                    </div>
                  ))}
                </>
              )}

              {activeView === 'assignments' && (
                <>
                  {selected.role !== 'learner' && (
                    <section style={{ marginBottom: 20 }}>
                      <h3>New assignment</h3>
                      <input style={inputStyle} value={assignment.title} onChange={(event) => setAssignment({ ...assignment, title: event.target.value })} placeholder="Assignment title" />
                      <input style={inputStyle} value={assignment.instructions} onChange={(event) => setAssignment({ ...assignment, instructions: event.target.value })} placeholder="Instructions" />
                      <textarea
                        style={inputStyle}
                        value={assignment.passage}
                        onChange={(event) => setAssignment({ ...assignment, passage: event.target.value })}
                        placeholder="Paste the typing passage learners will use (up to 20,000 characters)"
                        aria-label="Assignment typing passage"
                        rows={6}
                        maxLength={20000}
                        required
                      />
                      <small style={{ display: 'block', margin: '-4px 0 10px', opacity: 0.7 }}>
                        {assignment.passage.length}/20,000 characters · every learner types this exact text
                      </small>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input style={inputStyle} type="number" min="0" value={assignment.targetWpm} onChange={(event) => setAssignment({ ...assignment, targetWpm: event.target.value })} placeholder="Target WPM" />
                        <input style={inputStyle} type="number" min="0" max="100" value={assignment.targetAccuracy} onChange={(event) => setAssignment({ ...assignment, targetAccuracy: event.target.value })} placeholder="Target %" />
                      </div>
                      <button className="btn btn-primary" onClick={() => run(async () => {
                        await createSchoolAssignment(selected.class.id, assignment);
                          setAssignment({ title: '', instructions: '', passage: '', targetWpm: '', targetAccuracy: '' });
                      }, 'Assignment created.')}>Create assignment</button>
                      <div style={{ marginTop: 16 }}>
                        <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Import learners CSV</button>
                        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => run(async () => {
                            const result = await importSchoolLearners(selected.class.id, String(reader.result || ''));
                            setNotice(`${result.message}${result.invitations?.length ? ` Invite links were created for ${result.invitations.length} new email(s); recipients can accept after creating an account with that email.` : ''}`);
                          }, 'Learner import complete.');
                          reader.onerror = () => setNotice('Could not read the selected CSV file.');
                          reader.readAsText(file);
                          event.target.value = '';
                        }} />
                        <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={exportClass}>Export CSV</button>
                      </div>
                    </section>
                  )}
                  <h3>{selected.role === 'learner' ? 'Assignment completion history' : 'Assignment analytics'}</h3>
                  {selected.role === 'learner' && learnerAssignments.filter((item) => Number(item.classId) === Number(selected.class.id)).map((item) => (
                    <div key={item.id} style={{ padding: 12, margin: '8px 0', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                      <strong>{item.title}</strong>
                      <small style={{ display: 'block', color: item.status === 'passed' ? '#63cab7' : 'inherit', opacity: .8 }}>{item.status === 'passed' ? 'Verified pass' : item.status === 'submitted' ? 'Needs more practice' : 'Not started'}</small>
                      <div>{item.status === 'passed' ? `Passed · ${item.wpm} WPM · ${item.accuracy}% accuracy` : item.status === 'submitted' ? `Submitted · ${item.wpm} WPM · ${item.accuracy}% accuracy` : 'Not started'}</div>
                      {item.submittedAt && <small>Submitted {new Date(item.submittedAt).toLocaleString()}</small>}
                      {item.history?.length > 0 && (
                        <details style={{ marginTop: 8 }}>
                          <summary>{item.history.length} attempt(s)</summary>
                          {item.history.map((attempt, index) => <small key={`${attempt.raceId || 'attempt'}-${attempt.submittedAt || index}`} style={{ display: 'block' }}>Attempt {item.history.length - index}: {attempt.wpm} WPM · {attempt.accuracy}% · {attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : 'time unavailable'}</small>)}
                        </details>
                      )}
                      {item.status !== 'passed' && <div><Link className="btn btn-primary" style={{ display: 'inline-block', marginTop: 8 }} to={`/practice?schoolClassId=${selected.class.id}&assignmentId=${item.id}`}>{item.status === 'submitted' ? 'Try again' : 'Start assignment'}</Link></div>}
                    </div>
                  ))}
                  {(selected.assignments || []).map((item) => (
                    <div key={item.id} style={{ padding: 12, margin: '8px 0', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}>
                      <strong>{item.title}</strong>
                      <small style={{ display: 'block', opacity: .7 }}>Target: {item.targetWpm} WPM · {item.targetAccuracy}% accuracy</small>
                      {selected.role === 'learner' && item.mySubmission && <small style={{ display: 'block' }}>Latest result: {item.mySubmission.wpm} WPM · {item.mySubmission.accuracy}% accuracy{item.mySubmission.submittedAt ? ` · ${new Date(item.mySubmission.submittedAt).toLocaleString()}` : ''}</small>}
                      {['org_admin', 'teacher'].includes(selected.role) && <small style={{ display: 'block' }}>{item.completionCount} submission(s) · {item.submissions?.length || 0} result(s) shown</small>}
                      {['org_admin', 'teacher'].includes(selected.role) && item.passage && (
                        <details style={{ marginTop: 8 }}>
                          <summary>View assigned passage</summary>
                          <p style={{ whiteSpace: 'pre-wrap' }}>{item.passage}</p>
                        </details>
                      )}
                      {selected.role === 'learner' && <Link className="btn btn-primary" style={{ display: 'inline-block', marginTop: 8 }} to={`/practice?schoolClassId=${selected.class.id}&assignmentId=${item.id}`}>{item.mySubmission ? 'Retake assignment' : 'Start assignment'}</Link>}
                    </div>
                  ))}
                </>
              )}

              {activeView === 'members' && (
                <>
                  <h3>Organisation members</h3>
                  {selected.role === 'org_admin' && (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        const result = await inviteSchoolTeacher(selectedOrganization.id, teacherEmail);
                        setTeacherInvite(result.invitation?.token || '');
                        setTeacherEmail('');
                      }, 'Teacher invitation created. The invited teacher can accept it after signing in with that email.');
                    }}>
                      <input style={inputStyle} type="email" value={teacherEmail} onChange={(event) => setTeacherEmail(event.target.value)} placeholder="teacher@school.org" required />
                      <button className="btn btn-secondary" type="submit">Invite a teacher</button>
                      {teacherInvite && <small style={{ display: 'block', marginTop: 8 }}>Invitation token: <code>{teacherInvite}</code>. Share it securely with the invited teacher.</small>}
                    </form>
                  )}
                  {organizationMembers.map((member) => (
                    <div key={member.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                      <span>{member.username} · {member.email}</span>
                      <span>{member.status}</span>
                      {selected.role === 'org_admin' && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <select aria-label={`Role for ${member.username}`} value={member.role} onChange={async (event) => {
                            try {
                              await updateSchoolMemberRole(selectedOrganization.id, member.id, event.target.value);
                              await refreshMembers(selectedOrganization.id);
                              setNotice('Member role updated.');
                            } catch (error) {
                              setNotice(error.message);
                            }
                          }}>
                            <option value="org_admin">Admin</option>
                            <option value="teacher">Teacher</option>
                            <option value="learner">Learner</option>
                          </select>
                          <button className="btn btn-secondary" onClick={() => run(async () => {
                            await removeSchoolOrganizationMember(selectedOrganization.id, member.id);
                            await refreshMembers(selectedOrganization.id);
                          }, 'Member removed from the organisation.')}>Remove</button>
                        </span>
                      )}
                    </div>
                  ))}
                  {!organizationMembers.length && <p>No members to show.</p>}
                </>
              )}

              {activeView === 'settings' && (
                <>
                  <h3>Organisation settings</h3>
                  {selected.role !== 'org_admin' ? <p>Only organisation admins can change settings.</p> : (
                    <form onSubmit={(event) => {
                      event.preventDefault();
                      run(async () => {
                        await updateSchoolOrganisationSettings(selectedOrganization.id, { requireLearnerApproval });
                      }, 'Organisation settings updated.');
                    }}>
                      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
                        <input type="checkbox" checked={requireLearnerApproval} onChange={(event) => setRequireLearnerApproval(event.target.checked)} />
                        Require staff approval for learners joining with a class code
                      </label>
                      <button className="btn btn-primary" type="submit">Save settings</button>
                    </form>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
