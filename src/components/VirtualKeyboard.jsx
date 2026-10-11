import React, { useCallback, useMemo } from 'react';
import { useActiveKeyboard } from '../hooks/useActiveKeyboard';
import { KEYBOARD_LAYOUT } from '../utils/keyboardLayout';
import { getFingerInstruction } from '../utils/fingerMapping';

export default React.memo(function VirtualKeyboard({ expectedCharacter = '', mapping, phase = 'racing', normalizeKeyboardKey, title = 'Virtual keyboard' }) {
  const normalize = useCallback(
    (key) => normalizeKeyboardKey ? normalizeKeyboardKey(key) : (key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key),
    [normalizeKeyboardKey],
  );
  const activeKeys = useActiveKeyboard({ phase, normalizeKeyboardKey: normalize });
  const activeKeySet = useMemo(() => new Set(activeKeys), [activeKeys]);
  const instruction = getFingerInstruction(expectedCharacter, mapping);

  return (
    <div className="keyboard-preview">
      <div className="keyboard-preview__header">
        <h3>{title}</h3>
        <p>The next key is highlighted for touch typing.</p>
      </div>
      <div className="keyboard-board" aria-label="On-screen QWERTY keyboard">
        {KEYBOARD_LAYOUT.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="keyboard-row">
            {row.map((keyLabel, keyIndex) => {
              const normalizedKey = normalize(keyLabel);
              const isNext = Boolean(instruction.key) && normalizedKey === normalize(instruction.key);
              const isModifier = instruction.needsShift && keyLabel === 'Shift';
              const keyClass = [
                'keyboard-key',
                ['Backspace', 'Tab', 'CapsLock', 'Enter', 'Shift'].includes(keyLabel) ? 'keyboard-key--wide' : '',
                keyLabel === 'Space' ? 'keyboard-key--space' : '',
                activeKeySet.has(normalizedKey) ? 'is-active' : '',
                isNext || isModifier ? 'is-next' : '',
              ].filter(Boolean).join(' ');
              return <div key={`${keyLabel}-${keyIndex}`} className={keyClass}><span>{keyLabel === 'Space' ? 'Space Bar' : keyLabel}</span></div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
