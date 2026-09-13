import React from 'react';

/**
 * Renders the target passage character-by-character, colored by whether the
 * learner has typed that character correctly, incorrectly, or not yet - plus
 * the actual (visually hidden) input that captures keystrokes.
 */
export default function TypingBox({
  targetText,
  typedText,
  onChange,
  inputRef,
  disabled,
  autoFocus = true,
  blockPaste = false,
}) {
  // Simple, local guard: refuses pasted input so WPM/accuracy reflect actual
  // typing. This is intentionally independent of utils/typingEngine's
  // handlePasteAttempt (used on the racing side) since that file hasn't
  // been reviewed here - if Training should share that exact logic
  // (e.g. logging the attempt, not just silently blocking it), swap this
  // handler out for that shared util instead.
  function handlePaste(event) {
    if (blockPaste) event.preventDefault();
  }

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
        onPaste={handlePaste}
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