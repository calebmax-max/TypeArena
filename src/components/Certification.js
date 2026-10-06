import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getStoredUserSnapshot,
  startCertification,
  submitCertification,
  verifyCertificate,
} from '../utils/typingApi';
import { createBlurTracker, createKeystrokeLogger, diffAppendedChars } from '../utils/typingEngine';
import '../styles/Certification.css';

const CERTIFICATION_SESSION_KEY = 'typearena_certification_attempt';

const formatDuration = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const readCertificationSession = (userId) => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CERTIFICATION_SESSION_KEY) || 'null');
    if (
      saved?.ownerId === userId
      && saved.challenge?.attemptId
      && saved.challenge?.raceToken
      && typeof saved.typedText === 'string'
      && Number.isFinite(saved.deadlineMs)
    ) {
      return saved;
    }
  } catch (storageError) {
    console.warn('Could not restore the in-progress certification attempt.', storageError);
  }
  return null;
};

const persistCertificationSession = (session) => {
  try {
    sessionStorage.setItem(CERTIFICATION_SESSION_KEY, JSON.stringify(session));
  } catch (storageError) {
    console.warn('Could not save the in-progress certification attempt.', storageError);
  }
};

export function CertificationTest() {
  const [user] = useState(() => getStoredUserSnapshot());
  const [resumeState] = useState(() => readCertificationSession(user?.id));
  const [phase, setPhase] = useState(resumeState ? 'testing' : 'ready');
  const [challenge, setChallenge] = useState(resumeState?.challenge || null);
  const [typedText, setTypedText] = useState(resumeState?.typedText || '');
  const [secondsRemaining, setSecondsRemaining] = useState(
    resumeState ? Math.max(0, Math.ceil((resumeState.deadlineMs - Date.now()) / 1000)) : 180
  );
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [pasteAttempted, setPasteAttempted] = useState(Boolean(resumeState?.pasteAttempted));
  const typedTextRef = useRef(resumeState?.typedText || '');
  const deadlineRef = useRef(resumeState?.deadlineMs || 0);
  const loggerRef = useRef(null);
  const blurTrackerRef = useRef(null);
  const submittedRef = useRef(false);
  const didResumeRef = useRef(Boolean(resumeState));

  const submitAttempt = useCallback(async () => {
    if (!challenge || submittedRef.current) return;
    submittedRef.current = true;
    blurTrackerRef.current?.detach();
    setPhase('submitting');
    setError('');
    persistCertificationSession({
      ownerId: user?.id,
      challenge,
      deadlineMs: deadlineRef.current,
      typedText: typedTextRef.current,
      keystrokeLog: loggerRef.current?.log || [],
      blurEvents: blurTrackerRef.current?.events || [],
      pasteAttempted,
    });
    try {
      const response = await submitCertification(challenge.attemptId, {
        raceToken: challenge.raceToken,
        typedText: typedTextRef.current,
        keystrokeLog: loggerRef.current?.log || [],
        blurEvents: blurTrackerRef.current?.events || [],
        pasteAttempted,
      });
      setResult(response);
      sessionStorage.removeItem(CERTIFICATION_SESSION_KEY);
      setPhase('complete');
    } catch (submitError) {
      submittedRef.current = false;
      if (submitError.status === 409 && submitError.body?.remainingSeconds) {
        deadlineRef.current = Date.now() + submitError.body.remainingSeconds * 1000;
        setSecondsRemaining(submitError.body.remainingSeconds);
        blurTrackerRef.current?.attach();
        setPhase('testing');
        return;
      }
      setError(submitError.message || 'Could not submit the certification attempt.');
      setPhase('submit-error');
    }
  }, [challenge, pasteAttempted, user?.id]);

  useEffect(() => {
    if (phase !== 'testing') return undefined;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        void submitAttempt();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, submitAttempt]);

  useEffect(() => {
    if (phase !== 'testing' || !didResumeRef.current || !resumeState) return undefined;
    const elapsedMs = Math.max(0, Date.now() - (resumeState.deadlineMs - 180000));
    const logger = createKeystrokeLogger();
    logger.log.push(...(resumeState.keystrokeLog || []));
    loggerRef.current = {
      log: logger.log,
      record: (character) => {
        logger.log.push({
          t: Math.round(elapsedMs + performance.now() - loggerStartedAt),
          ch: String(character ?? ''),
        });
      },
    };
    const loggerStartedAt = performance.now();
    const tracker = createBlurTracker();
    tracker.events.push(...(resumeState.blurEvents || []));
    tracker.attach();
    blurTrackerRef.current = tracker;
    didResumeRef.current = false;
    return () => tracker.detach();
  }, [phase, resumeState]);

  useEffect(() => () => blurTrackerRef.current?.detach(), []);

  const beginTest = async () => {
    if (phase === 'starting') return;
    setPhase('starting');
    setError('');
    setResult(null);
    try {
      const newChallenge = await startCertification();
      setChallenge(newChallenge);
      setTypedText('');
      typedTextRef.current = '';
      setPasteAttempted(false);
      setSecondsRemaining(newChallenge.durationSeconds);
      deadlineRef.current = Date.now() + newChallenge.durationSeconds * 1000;
      loggerRef.current = createKeystrokeLogger();
      blurTrackerRef.current = createBlurTracker();
      blurTrackerRef.current.attach();
      submittedRef.current = false;
      persistCertificationSession({
        ownerId: user.id,
        challenge: newChallenge,
        deadlineMs: deadlineRef.current,
        typedText: '',
        keystrokeLog: [],
        blurEvents: [],
        pasteAttempted: false,
      });
      setPhase('testing');
    } catch (startError) {
      setError(startError.message || 'Could not start the certification test.');
      setPhase('error');
    }
  };

  const handleTyping = (event) => {
    const nextText = event.target.value;
    if (nextText.length > challenge.passage.length) return;
    loggerRef.current?.record(diffAppendedChars(typedTextRef.current, nextText));
    typedTextRef.current = nextText;
    setTypedText(nextText);
    persistCertificationSession({
      ownerId: user.id,
      challenge,
      deadlineMs: deadlineRef.current,
      typedText: nextText,
      keystrokeLog: loggerRef.current?.log || [],
      blurEvents: blurTrackerRef.current?.events || [],
      pasteAttempted,
    });
  };

  const handlePaste = (event) => {
    event.preventDefault();
    setPasteAttempted(true);
    persistCertificationSession({
      ownerId: user.id,
      challenge,
      deadlineMs: deadlineRef.current,
      typedText: typedTextRef.current,
      keystrokeLog: loggerRef.current?.log || [],
      blurEvents: blurTrackerRef.current?.events || [],
      pasteAttempted: true,
    });
  };

  const handleBlockedClipboardAction = (event) => event.preventDefault();

  if (!user?.id) {
    return (
      <section className="cert-page">
        <div className="cert-card">
          <p className="cert-eyebrow">TypeArena assessment</p>
          <h1>Typing speed and accuracy certificate</h1>
          <p>Sign in to start a certification attempt.</p>
          <Link className="cert-button" to="/profile?signup=1">Sign in or create an account</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="cert-page">
      <div className="cert-card">
        <p className="cert-eyebrow">TypeArena assessment</p>
        <h1>Typing speed and accuracy certificate</h1>
        <p className="cert-intro">
          The fixed test lasts three minutes. A passing score requires at least
          40 WPM, 95% accuracy, and 600 typed characters. Attempts are limited
          to one every 30 days.
        </p>

        {error && <p className="cert-notice cert-notice--error" role="alert">{error}</p>}

        {phase === 'ready' || phase === 'starting' || phase === 'error' ? (
          <div className="cert-start">
            <ul>
              <li>Use the fixed passage shown during the assessment.</li>
              <li>Copy and paste are blocked and monitored.</li>
              <li>Window switching and typing telemetry may be reviewed.</li>
              <li>Certificates verify the test conditions and recorded score, not a broader professional qualification.</li>
            </ul>
            <button type="button" className="cert-button" onClick={beginTest} disabled={phase === 'starting'}>
              {phase === 'starting' ? 'Preparing test...' : 'Start certification'}
            </button>
          </div>
        ) : null}

        {phase === 'testing' && challenge && (
          <div className="cert-test">
            <div className="cert-test__status">
              <strong aria-live="polite">{formatDuration(secondsRemaining)}</strong>
              <span>{typedText.length} characters typed</span>
            </div>
            <div className="cert-passage" aria-label="Fixed certification passage" onCopy={handleBlockedClipboardAction}>
              {challenge.passage}
            </div>
            <label className="cert-input-label" htmlFor="certification-typing-input">
              Type the passage below
            </label>
            <textarea
              id="certification-typing-input"
              autoFocus
              value={typedText}
              onChange={handleTyping}
              onPaste={handlePaste}
              onCopy={handleBlockedClipboardAction}
              onCut={handleBlockedClipboardAction}
              onDrop={handlePaste}
              spellCheck="false"
              autoCapitalize="off"
              autoCorrect="off"
              maxLength={challenge.passage.length}
              rows={8}
              aria-describedby="certification-test-note"
            />
            <p id="certification-test-note" className="cert-muted">
              The test submits automatically when the timer ends. Keep this page open until then.
            </p>
          </div>
        )}

        {phase === 'submitting' && (
          <p className="cert-notice" role="status">Checking your result and anti-cheat signals...</p>
        )}

        {phase === 'submit-error' && (
          <div>
            <p className="cert-notice cert-notice--error" role="alert">{error}</p>
            <button type="button" className="cert-button" onClick={() => void submitAttempt()}>
              Retry submitting this attempt
            </button>
          </div>
        )}

        {phase === 'complete' && result && (
          <div className="cert-result" role="status">
            <h2>
              {result.status === 'passed' ? 'Assessment passed' :
                result.status === 'flagged' ? 'Attempt under review' : 'Assessment not passed'}
            </h2>
            <div className="cert-result__stats">
              <span><strong>{result.wpm}</strong> WPM</span>
              <span><strong>{result.accuracy}%</strong> accuracy</span>
            </div>
            <p>{result.message}</p>
            {result.status === 'passed' && result.certificateId && (
              <Link className="cert-button" to={`/verify/${encodeURIComponent(result.certificateId)}`}>
                View verification page
              </Link>
            )}
            {result.status === 'flagged' && result.antiCheatFlags?.length > 0 && (
              <p className="cert-muted">Review flags: {result.antiCheatFlags.join(', ')}</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function CertificateVerification() {
  const { certificateId } = useParams();
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    verifyCertificate(certificateId)
      .then((data) => {
        if (active) setCertificate(data);
      })
      .catch((verifyError) => {
        if (active) setError(verifyError.message || 'Certificate could not be verified.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [certificateId]);

  return (
    <section className="cert-page">
      <div className="cert-card cert-verification">
        <p className="cert-eyebrow">Public verification</p>
        <h1>TypeArena certificate</h1>
        {loading && <p role="status">Checking certificate...</p>}
        {!loading && error && <p className="cert-notice cert-notice--error" role="status">{error}</p>}
        {!loading && certificate && (
          <>
            <div className="cert-validity"><span aria-hidden="true">✓</span> Valid</div>
            <dl>
              <div><dt>Certificate ID</dt><dd>{certificate.certificateId}</dd></div>
              <div><dt>Learner</dt><dd>{certificate.playerName}</dd></div>
              {certificate.certificateType === 'school_course' ? (
                <>
                  <div><dt>Programme</dt><dd>{certificate.courseName}</dd></div>
                  <div><dt>School</dt><dd>{certificate.organizationName}</dd></div>
                  <div><dt>Class</dt><dd>{certificate.className}</dd></div>
                  <div><dt>Lessons completed</dt><dd>{certificate.totalLessons}</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Typing speed</dt><dd>{certificate.wpm} WPM</dd></div>
                  <div><dt>Accuracy</dt><dd>{certificate.accuracy}%</dd></div>
                </>
              )}
              <div><dt>Issue date</dt><dd>{certificate.testDate ? new Date(certificate.testDate).toLocaleDateString() : 'Not available'}</dd></div>
            </dl>
            {certificate.certificateType !== 'school_course' && <p className="cert-muted">
              Test conditions: three minutes; passing threshold {certificate.minimumWpm} WPM,
              {' '}{certificate.minimumAccuracy}% accuracy, and {certificate.minimumCharacters} characters.
            </p>}
            <p className="cert-muted">{certificate.statement}</p>
          </>
        )}
      </div>
    </section>
  );
}

export default CertificationTest;
