import { useCallback, useEffect, useRef, useState } from 'react';
import { computeTypingStats } from 'src/placementTest';

/**
 * Drives a single typing attempt against `targetText`: starts timing on the
 * first keystroke, tracks what's been typed, and calls `onFinish` once the
 * text is fully typed or `maxDurationSeconds` runs out - whichever first.
 */
export function useTypingSession(targetText, { maxDurationSeconds, onFinish } = {}) {
  const [typedText, setTypedText] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [finished, setFinished] = useState(false);
  const finishedRef = useRef(false);
  const inputRef = useRef(null);

  const finish = useCallback(
    (finalTypedText) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      setFinished(true);
      const elapsed = startedAt ? (Date.now() - startedAt) / 1000 : 0;
      const stats = computeTypingStats({
        targetText,
        typedText: finalTypedText,
        elapsedSeconds: elapsed,
      });
      onFinish?.(stats);
    },
    [onFinish, startedAt, targetText],
  );

  const handleChange = useCallback(
    (event) => {
      if (finishedRef.current) return;
      const value = event.target.value;
      if (!startedAt && value.length > 0) {
        setStartedAt(Date.now());
      }
      setTypedText(value);
      if (value.length >= targetText.length) {
        finish(value);
      }
    },
    [finish, startedAt, targetText],
  );

  // Live elapsed-time ticker, and the time-limit cutoff.
  useEffect(() => {
    if (!startedAt || finished) return undefined;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setElapsedSeconds(elapsed);
      if (maxDurationSeconds && elapsed >= maxDurationSeconds) {
        finish(typedText);
      }
    }, 200);
    return () => clearInterval(interval);
  }, [startedAt, finished, maxDurationSeconds, finish, typedText]);

  const reset = useCallback(() => {
    setTypedText('');
    setStartedAt(null);
    setElapsedSeconds(0);
    setFinished(false);
    finishedRef.current = false;
    inputRef.current?.focus();
  }, []);

  return {
    typedText,
    elapsedSeconds,
    finished,
    handleChange,
    reset,
    inputRef,
    timeRemaining: maxDurationSeconds ? Math.max(0, maxDurationSeconds - elapsedSeconds) : null,
  };
}