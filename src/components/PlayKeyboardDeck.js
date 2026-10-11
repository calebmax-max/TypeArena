import React from 'react';
import VirtualKeyboard from './VirtualKeyboard';

export default React.memo(function PlayKeyboardDeck({ phase, normalizeKeyboardKey, expectedKey }) {
  return (
    <VirtualKeyboard
      phase={phase}
      normalizeKeyboardKey={normalizeKeyboardKey}
      expectedCharacter={expectedKey}
      title="TypeArena Keyboard Guide"
    />
  );
});
