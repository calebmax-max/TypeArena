import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  createSchoolAssignment,
  createSchoolClass,
  createSchoolOrganisation,
  exportSchoolClass,
  fetchSchoolClass,
  fetchSchoolOverview,
  importSchoolLearners,
  joinSchoolClass,
} from '../utils/typingApi';

const cardStyle = { background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 18, padding: 20 };
const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.14)', background: '#111827', color: 'inherit', marginBottom: 10 };

export default function SchoolDashboard({ currentUser }) {
  const [overview, setOverview] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');
  const [orgName, setOrgName] = useState('');
  const [className, setClassName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [assignment, setAssignment] = useState({ title: '', instructions: '', targetWpm: '', targetAccuracy: '' });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!currentUser?.id) return;
    try { setOverview(await fetchSchoolOverview()); } catch (error) { setNotice(error.message); }
  }, [currentUser?.id]);
  useEffect(() => { load(); }, [load]);

  const chooseClass = async (id) => {
    try { setSelected(await fetchSchoolClass(id)); } catch (error) { setNotice(error.message); }
  };
  const run = async (fn) => { try { await fn(); await load(); setNotice('Saved.'); } catch (error) { setNotice(error.message); } };

  if (!currentUser?.id) {
    return <div className="profile-container"><section className="auth-section"><h1>School mode</h1><p>Sign in first to join a class or create an organisation.</p></section></div>;
  }

  return (
    <div className="profile-container" style={{ maxWidth: 1180, margin: '0 auto', padding: '42px 18px' }}>
      <section className="profile-hero" style={{ marginBottom: 24 }}>
        <span className="eyebrow">Organisation mode</span>
        <h1>Classes, assignments, progress.</h1>
        <p>Keep school racing private, measurable, and free of stakes or withdrawals.</p>
      </section>
      {notice && <div className="auth-notice" style={{ marginBottom: 18 }}>{notice}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16, marginBottom: 18 }}>
        <div style={cardStyle}>
          <h2>Create an organisation</h2>
          <p>Start a school or training-centre workspace.</p>
          <input style={inputStyle} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" />
          <button className="btn btn-primary" onClick={() => run(async () => { await createSchoolOrganisation(orgName); setOrgName(''); })}>Create organisation</button>
        </div>
        <div style={cardStyle}>
          <h2>Join a class</h2>
          <p>Use the code shared by your teacher.</p>
          <input style={inputStyle} value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Six-character code" />
          <button className="btn btn-primary" onClick={() => run(async () => { await joinSchoolClass(joinCode); setJoinCode(''); })}>Join class</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px,.7fr) minmax(320px,1.3fr)', gap: 18 }}>
        <div style={cardStyle}>
          <h2>Your school spaces</h2>
          {(overview?.organizations || []).map((org) => <div key={org.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}><strong>{org.name}</strong><small style={{ display: 'block', opacity: .65 }}>{org.role}</small></div>)}
          <h3 style={{ marginTop: 22 }}>Classes</h3>
          {(overview?.classes || []).map((item) => <button key={item.id} type="button" onClick={() => chooseClass(item.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, margin: '8px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: selected?.class?.id === item.id ? 'rgba(99,202,183,.16)' : 'transparent', color: 'inherit' }}>{item.name}<small style={{ display: 'block', opacity: .65 }}>{item.learnerCount} learners · code {item.joinCode}</small></button>)}
        </div>
        <div style={cardStyle}>
          {!selected ? <><h2>Teacher and learner workspace</h2><p>Select a class to see progress, assignments, and class-safe reporting.</p><p style={{ opacity: .7 }}>Practice, public races, and free private rooms remain in the core TypeArena experience.</p></> : <>
            <h2>{selected.class.name}</h2><p>{selected.learners.length} learners · your role: {selected.role}</p>
            {['org_admin', 'teacher'].includes(selected.role) && <>
              <input style={inputStyle} value={className} onChange={(e) => setClassName(e.target.value)} placeholder="New class name" />
              <button className="btn btn-secondary" onClick={() => run(async () => { await createSchoolClass(selected.class.organizationId, className); setClassName(''); })}>Create another class</button>
              <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,.1)' }}>
                <h3>New assignment</h3>
                <input style={inputStyle} value={assignment.title} onChange={(e) => setAssignment({ ...assignment, title: e.target.value })} placeholder="Assignment title" />
                <input style={inputStyle} value={assignment.instructions} onChange={(e) => setAssignment({ ...assignment, instructions: e.target.value })} placeholder="Instructions" />
                <div style={{ display: 'flex', gap: 8 }}><input style={inputStyle} type="number" value={assignment.targetWpm} onChange={(e) => setAssignment({ ...assignment, targetWpm: e.target.value })} placeholder="Target WPM" /><input style={inputStyle} type="number" value={assignment.targetAccuracy} onChange={(e) => setAssignment({ ...assignment, targetAccuracy: e.target.value })} placeholder="Target %" /></div>
                <button className="btn btn-primary" onClick={() => run(async () => { await createSchoolAssignment(selected.class.id, assignment); setAssignment({ title: '', instructions: '', targetWpm: '', targetAccuracy: '' }); })}>Create assignment</button>
                <div style={{ marginTop: 16 }}><button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>Import learners CSV</button><input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => run(async () => { const result = await importSchoolLearners(selected.class.id, String(reader.result || '')); setNotice(`${result.message} ${result.unmatched?.length ? `${result.unmatched.length} email(s) were not found.` : ''}`); }); reader.readAsText(file); }} /><button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={async () => { const blob = await exportSchoolClass(selected.class.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `typearena-class-${selected.class.id}.csv`; a.click(); URL.revokeObjectURL(url); }}>Export CSV</button></div>
              </div>
            </>}
            <h3 style={{ marginTop: 24 }}>Learner progress</h3>
            {selected.learners.map((learner) => <div key={learner.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.08)' }}><span>{learner.username}</span><span>{learner.wpm} WPM · {learner.accuracy}%</span></div>)}
            <h3 style={{ marginTop: 24 }}>Assignments</h3>
            {(selected.assignments || []).map((item) => <div key={item.id} style={{ padding: 12, margin: '8px 0', borderRadius: 10, background: 'rgba(255,255,255,.04)' }}><strong>{item.title}</strong><small style={{ display: 'block', opacity: .7 }}>Target: {item.targetWpm} WPM · {item.targetAccuracy}% accuracy</small></div>)}
          </>}
        </div>
      </div>
    </div>
  );
}
