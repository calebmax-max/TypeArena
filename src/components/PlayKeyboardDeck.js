import React, { useMemo } from 'react';
import { useActiveKeyboard } from '../hooks/useActiveKeyboard';
import { KEYBOARD_LAYOUT } from '../utils/keyboardLayout';

export default React.memo(function PlayKeyboardDeck({ phase, normalizeKeyboardKey }) {
  const activeKeys = useActiveKeyboard({ phase, normalizeKeyboardKey });
  const activeKeySet = useMemo(() => new Set(activeKeys), [activeKeys]);

  return (
    <div className="keyboard-preview">
      <div className="keyboard-preview__header">
        <h3>Live Keyboard Deck</h3>
        <p>Your equipped keyboard skin is rendered here while you type.</p>
      </div>
      <div className="keyboard-board" aria-label="On-screen keyboard">
        {KEYBOARD_LAYOUT.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="keyboard-row">
            {row.map((keyLabel, keyIndex) => {
              const normalizedKey = normalizeKeyboardKey(keyLabel);
              const isActive = activeKeySet.has(normalizedKey);
              const keyClass = [
                'keyboard-key',
                keyLabel === 'Backspace' || keyLabel === 'Tab' || keyLabel === 'CapsLock' || keyLabel === 'Enter' || keyLabel === 'Shift'
                  ? 'keyboard-key--wide'
                  : '',
                keyLabel === 'Space' ? 'keyboard-key--space' : '',
                isActive ? 'is-active' : '',
              ].filter(Boolean).join(' ');
              return (
                <div key={`${keyLabel}-${keyIndex}`} className={keyClass}>
                  <span>{keyLabel === 'Space' ? 'Space Bar' : keyLabel}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
