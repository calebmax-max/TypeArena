import React, { useEffect, useState } from 'react';
import { fetchPracticalTasks, submitPracticalTask } from '../utils/typingApi';
import './PracticalTasks.css';

export default function PracticalTasks() {
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [response, setResponse] = useState({ text: '', subject: '', body: '', answer: '' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchPracticalTasks().then((data) => setTasks(data.tasks || [])).catch((requestError) => setError(requestError.message || 'Could not load practical tasks.'));
  }, []);

  function chooseTask(task) {
    setSelected(task);
    setResult(null);
    setError('');
    setResponse({ text: '', subject: '', body: '', answer: '' });
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    try {
      const payload = selected.taskType === 'email' ? { subject: response.subject, body: response.body } : selected.taskType === 'choice' ? { answer: response.answer } : { text: response.text };
      setResult(await submitPracticalTask(selected.slug, payload));
    } catch (requestError) {
      setError(requestError.message || 'Could not save this task evidence.');
    }
  }

  return (
    <main className="practical-tasks-page">
      <header className="practical-tasks-hero"><span>Practical computer skills</span><h1>Practice the tasks behind the typing.</h1><p>These simulations measure how you apply digital skills at school and work. They do not access your real files, email, or accounts.</p></header>
      {error && <p className="practical-tasks-error" role="alert">{error}</p>}
      <div className="practical-tasks-layout">
        <aside className="practical-task-list" aria-label="Practical tasks">
          {tasks.map((task) => <button type="button" className={selected?.slug === task.slug ? 'is-selected' : ''} key={task.slug} onClick={() => chooseTask(task)}><small>{task.category}</small><strong>{task.title}</strong><span>{task.objective}</span></button>)}
        </aside>
        <section className="practical-task-workspace">
          {selected ? <>
            <span className="practical-tasks-kicker">{selected.category}</span><h2>{selected.title}</h2><p>{selected.objective}</p><div className="practical-task-instructions"><strong>Task</strong><span>{selected.instructions}</span><small>Hint: {selected.hint}</small></div>
            <form onSubmit={submit}>
              {selected.taskType === 'choice' && <fieldset><legend>Choose the safest action</legend>{selected.options.map((option) => <label key={option.value}><input type="radio" name="task-answer" value={option.value} checked={response.answer === option.value} onChange={(event) => setResponse({ ...response, answer: event.target.value })} required />{option.label}</label>)}</fieldset>}
              {selected.taskType === 'email' && <><label>Subject<input value={response.subject} onChange={(event) => setResponse({ ...response, subject: event.target.value })} required /></label><label>Email body<textarea rows={9} value={response.body} onChange={(event) => setResponse({ ...response, body: event.target.value })} required /></label></>}
              {selected.taskType === 'text' && <label>Your response<textarea rows={10} value={response.text} onChange={(event) => setResponse({ ...response, text: event.target.value })} required /></label>}
              <button className="practical-task-submit" type="submit">Submit evidence</button>
            </form>
            {result && <div className={`practical-task-result ${result.passed ? 'is-pass' : 'is-retry'}`} role="status"><strong>{result.passed ? 'Evidence accepted' : 'Keep practising'}</strong><span>{result.message}</span><small>Score: {result.score}%</small></div>}
          </> : <div className="practical-task-empty"><h2>Select a practical task</h2><p>Choose a simulation to see its objective, instructions, and evidence criteria.</p></div>}
        </section>
      </div>
    </main>
  );
}
