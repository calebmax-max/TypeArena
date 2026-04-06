// Typing engine utilities for WPM and accuracy calculations

export const calculateWPM = (text, timeElapsedSeconds) => {
  if (timeElapsedSeconds === 0) return 0;
  const trimmedText = text.trim();
  if (!trimmedText) return 0;
  const words = trimmedText.split(/\s+/).length;
  const minutes = timeElapsedSeconds / 60;
  return Math.round((words / minutes) * 10) / 10;
};

export const calculateAccuracy = (originalText, typedText) => {
  let correctChars = 0;
  const minLength = Math.min(originalText.length, typedText.length);

  for (let i = 0; i < minLength; i++) {
    if (originalText[i] === typedText[i]) {
      correctChars++;
    }
  }

  const totalChars = originalText.length;
  return totalChars === 0 ? 100 : Math.round((correctChars / totalChars) * 1000) / 10;
};

export const generateRaceId = () => {
  return `race_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export const calculateNetWPM = (grossWPM, errorRate) => {
  // Net WPM = Gross WPM - (error rate * gross WPM)
  const netWPM = grossWPM - (errorRate * grossWPM);
  return Math.max(0, Math.round(netWPM * 10) / 10);
};

export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
