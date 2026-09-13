import React from 'react';

/**
 * Renders the target passage character-by-character, colored by whether the
 * learner has typed that character correctly, incorrectly, or not yet - plus
 * the actual (visually hidden) input that captures keystrokes.
 */
export default function TypingBox({ targetText, typedText, onChange, inputRef, disabled, autoFocus = true }) {
  return (
    <div className="training-typing-box">
      <div className="training-typing-box__passage" aria-hidden="true">
        {targetText.split('').map((char, idx) => {
          let className = 'training-typing-box__char';
          if (idx < typedText.length) {
            className += typedText[idx] === char
              ? ' training-typing-box__char--correct'
              : ' training-typing-box__char--incorrect';
          } else if (idx === typedText.length) {
            className += ' training-typing-box__char--cursor';
          }
          return (
            <span key={idx} className={className}>
              {char}
            </span>
          );
        })}
      </div>
      <textarea
        ref={inputRef}
        className="training-typing-box__input"
        value={typedText}
        onChange={onChange}
        disabled={disabled}
        autoFocus={autoFocus}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        aria-label="Type the passage shown above"
        placeholder="Start typing to begin..."
      />
    </div>
  );
}