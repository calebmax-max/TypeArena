import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createHiringTest, fetchHiringAttempts, fetchHiringSummary, fetchHiringTest, fetchHiringTests, startHiringTest, submitHiringAttempt } from '../utils/typingApi';
import './Training.css';
import TypingBox from './TypingBox';
import '../styles/Hiring.css';

const cardStyle = { background: 'var(--tp-paper, #10251d)', color: 'var(--tp-ink, #edf8f2)', borderRadius: 18, padding: 24, marginBottom: 18, boxShadow: '0 16px 40px rgba(0,0,0,.22)', border: '1px solid rgba(123,224,168,.16)' };

export function EmployerHiring({ currentUser }) {
  const [summary, setSummary] = useState(null); const [tests, setTests] = useState([]); const [selected, setSelected] = useState(null); const [attempts, setAttempts] = useState([]); const [notice, setNotice] = useState('');
  const [form, setForm] = useState({ title: '', companyName: '', category: 'typing', durationSeconds: 180, minWpm: 40, minAccuracy: 90, maxAttempts: 1, passage: '' });
  const refresh = async () => { try { setSummary(await fetchHiringSummary()); setTests(await fetchHiringTests()); } catch (error) { setNotice(error.message); } };
  useEffect(() => { if (currentUser?.id) refresh(); }, [currentUser?.id]);
  const submit = async (event) => { event.preventDefault(); setNotice(''); try { await createHiringTest(form); setForm({ title: '', companyName: '', category: 'typing', durationSeconds: 180, minWpm: 40, minAccuracy: 90, maxAttempts: 1, passage: '' }); setNotice('Hiring test created.'); await refresh(); } catch (error) { setNotice(error.message); } };
  const showAttempts = async (test) => { setSelected(test); try { setAttempts(await fetchHiringAttempts(test.id)); } catch (error) { setNotice(error.message); } };
  const copyTestLink = async (test) => {
    const link = `${window.location.origin}/test/${test.publicCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Candidate test link copied.');
    } catch {
      setNotice(`Copy failed. Select this link manually: ${link}`);
    }
  };
  if (!currentUser?.id) return <section style={cardStyle}><h1>TypeArena Hiring</h1><p>Sign in to create and manage hiring assessments.</p><Link className="btn btn-primary" to="/profile">Sign in</Link></section>;
  if (!['employer', 'admin'].includes(currentUser.accountRole) && !currentUser.isAdmin) return <section style={cardStyle}><h1>Employer access required</h1><p>Your account is not enabled for TypeArena Hiring yet.</p></section>;
  return <div className="hiring-page profile-container" style={{ maxWidth: 1120, margin: '0 auto', padding: '36px 18px' }}>
    <div style={cardStyle}><p style={{ textTransform: 'uppercase', letterSpacing: '.12em', opacity: .65 }}>TypeArena Hiring</p><h1>Screen candidates with verified typing tests</h1><p>Create a test, send the private link, and review server-scored results.</p>{summary && <p><strong>{summary.freeAttemptsRemaining}</strong> free completed attempts remaining · {summary.activeTests} active tests</p>}</div>
    {notice && <div className="auth-notice" role="status" style={{ marginBottom: 18 }}>{notice}</div>}
    <section style={cardStyle}><h2>Create a hiring test</h2><form onSubmit={submit} style={{ display: 'grid', gap: 12, maxWidth: 760 }}><input className="hiring-input" required placeholder="Test title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /><input className="hiring-input" required placeholder="Company name" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} /><select className="hiring-input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="typing">Typing speed and accuracy</option><option value="customer_support">Customer support</option><option value="data_entry">Data entry</option></select><textarea className="hiring-input" required minLength={20} rows={7} placeholder="Paste the test passage. It is stored privately in the backend." value={form.passage} onChange={e => setForm({ ...form, passage: e.target.value })} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10 }}><label>Seconds<input className="hiring-input" type="number" min="30" max="3600" value={form.durationSeconds} onChange={e => setForm({ ...form, durationSeconds: e.target.value })} /></label><label>Minimum WPM<input className="hiring-input" type="number" min="0" value={form.minWpm} onChange={e => setForm({ ...form, minWpm: e.target.value })} /></label><label>Accuracy %<input className="hiring-input" type="number" min="0" max="100" value={form.minAccuracy} onChange={e => setForm({ ...form, minAccuracy: e.target.value })} /></label><label>Attempts<input className="hiring-input" type="number" min="1" max="10" value={form.maxAttempts} onChange={e => setForm({ ...form, maxAttempts: e.target.value })} /></label></div><button className="btn btn-primary" type="submit">Create test</button></form></section>
    <section style={cardStyle}><h2>Your tests</h2>{tests.length === 0 ? <p>No tests yet.</p> : tests.map(test => <div key={test.id} style={{ borderTop: '1px solid #e5e7eb', padding: '16px 0', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><strong>{test.title}</strong><div>{test.companyName} · {test.minWpm} WPM · {test.minAccuracy}% accuracy · {test.attemptCount} completed</div><small>Candidate link: {window.location.origin}/test/{test.publicCode}</small><button type="button" className="btn btn-secondary hiring-copy-link" onClick={() => copyTestLink(test)}>Copy link</button></div><button className="btn btn-secondary" onClick={() => showAttempts(test)}>View results</button></div>)}</section>
    {selected && <section style={cardStyle}><h2>{selected.title} results</h2>{attempts.length === 0 ? <p>No completed attempts yet.</p> : <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Candidate</th><th>WPM</th><th>Accuracy</th><th>Status</th><th>Flags</th></tr></thead><tbody>{attempts.map(item => <tr key={item.id}><td>{item.candidate}<br /><small>{item.email}</small></td><td>{item.wpm}</td><td>{item.accuracy}%</td><td>{item.passed ? 'Passed' : 'Failed'}</td><td>{item.suspicious ? 'Suspicious' : '—'}</td></tr>)}</tbody></table></div>}</section>}
  </div>;
}

export function CandidateHiringTest({ currentUser }) {
  const { publicCode } = useParams();
  const [test, setTest] = useState(null); const [typed, setTyped] = useState(''); const [attempt, setAttempt] = useState(null); const [startedAt, setStartedAt] = useState(null); const [result, setResult] = useState(null); const [notice, setNotice] = useState(''); const [tabSwitches, setTabSwitches] = useState(0); const [pasteAttempts, setPasteAttempts] = useState(0);
  useEffect(() => { fetchHiringTest(publicCode).then(setTest).catch(e => setNotice(e.message)); }, [publicCode]);
  useEffect(() => { const onBlur = () => attempt && setTabSwitches(value => value + 1); window.addEventListener('blur', onBlur); return () => window.removeEventListener('blur', onBlur); }, [attempt]);
  const start = async () => { try { const data = await startHiringTest(publicCode); setAttempt(data); setStartedAt(Date.now()); setTyped(''); } catch (e) { setNotice(e.message); } };
  const submit = async () => { try { setResult(await submitHiringAttempt(attempt.attemptId, { typedText: typed, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), tabSwitches, pasteAttempts })); setAttempt(null); } catch (e) { setNotice(e.message); } };
  if (!test) return <section style={cardStyle}><h1>Hiring test</h1><p>{notice || 'Loading test…'}</p></section>;
  return <div className="profile-container" style={{ maxWidth: 900, margin: '0 auto', padding: '36px 18px' }}><section style={cardStyle}><p style={{ opacity: .65 }}>{test.companyName}</p><h1>{test.title}</h1><p>{test.durationSeconds}s · Minimum {test.minWpm} WPM · {test.minAccuracy}% accuracy · {test.maxAttempts} attempt(s)</p>{notice && <div className="auth-notice" role="alert">{notice}</div>}{result ? <div><h2>{result.passed ? 'Passed' : 'Test complete'}</h2><p><strong>{result.wpm} WPM</strong> · <strong>{result.accuracy}% accuracy</strong></p><p>This result was verified under TypeArena testing conditions.</p></div> : !attempt ? <><p>Sign in to take this assessment. Your result will be linked to your TypeArena profile.</p>{currentUser?.id ? <button className="btn btn-primary" onClick={start}>Start test</button> : <Link className="btn btn-primary" to={`/profile?redirect=/test/${publicCode}`}>Sign in to start</Link>}</> : <><p>Type the passage below. Copy and paste are disabled.</p><div className="hiring-test-stage"><TypingBox targetText={attempt.passage} typedText={typed} onChange={event => setTyped(event.target.value)} blockPaste onPasteAttempt={() => setPasteAttempts(value => value + 1)} /></div><button className="btn btn-primary" style={{ marginTop: 14 }} onClick={submit}>Submit test</button></>}</section></div>;
}
