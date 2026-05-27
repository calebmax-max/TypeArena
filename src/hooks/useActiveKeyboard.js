import { useEffect, useRef, useState } from 'react';

export function useActiveKeyboard({ phase, normalizeKeyboardKey, onBlur, onFocus }) {
  const activeKeysRef = useRef([]);
  const [activeKeys, setActiveKeys] = useState([]);

  useEffect(() => {
    if (phase !== 'racing') {
      activeKeysRef.current = [];
      setActiveKeys([]);
      return undefined;
    }

    let rafId = null;
    const flushKeys = () => {
      setActiveKeys([...activeKeysRef.current]);
      rafId = null;
    };
    const scheduleFlush = () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(flushKeys);
      }
    };

    const handleWindowKeyDown = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) return;
      if (!activeKeysRef.current.includes(normalized)) {
        activeKeysRef.current = [...activeKeysRef.current, normalized];
        scheduleFlush();
      }
    };

    const handleWindowKeyUp = (event) => {
      const normalized = normalizeKeyboardKey(event.key);
      if (!normalized) return;
      activeKeysRef.current = activeKeysRef.current.filter((item) => item !== normalized);
      scheduleFlush();
    };

    const handleWindowBlur = () => {
      activeKeysRef.current = [];
      setActiveKeys([]);
      onBlur?.();
    };

    const handleWindowFocus = () => {
      onFocus?.();
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    window.addEventListener('keyup', handleWindowKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      window.removeEventListener('keydown', handleWindowKeyDown);
      window.removeEventListener('keyup', handleWindowKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [normalizeKeyboardKey, onBlur, onFocus, phase]);

  return activeKeys;
}
