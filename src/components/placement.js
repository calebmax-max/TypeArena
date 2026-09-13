// placementTest.js
//
// Day 1, before touching the curriculum: one 30-second sample of normal
// text. Not a lesson - diagnostic. Whatever WPM/accuracy comes out of it
// decides where in the 7-unit path this person actually starts, so a total
// beginner starts at Lesson 1 and someone who already types 45 WPM might
// start three units in.

export const PLACEMENT_DURATION_SECONDS = 30;

export const PLACEMENT_SAMPLE_TEXT =
  'Typing well is a skill built from repetition, not talent. Most people ' +
  'never notice their own bad habits until they try to break them, which ' +
  'is exactly why a short, honest sample of normal typing is worth more ' +
  'than a guess. Read this at whatever pace feels natural, mistakes and ' +
  'all, and the system will find the right starting point from there.';

/**
 * Given a placement WPM/accuracy, find the furthest lesson in the sequence
 * the learner already qualifies for. "Qualifies" means the sample beat that
 * lesson's own pass bar - if they can already clear a lesson's bar on a
 * cold, unpracticed sample, there's no value in forcing them through it.
 *
 * Always returns a real lesson id - a complete beginner lands on the very
 * first lesson in the sequence.
 */
export function findPlacementLesson(wpm, accuracy, lessonSequence) {
  let placementIndex = 0;
  for (let i = 0; i < lessonSequence.length; i += 1) {
    const lesson = lessonSequence[i];
    if (wpm >= lesson.minWpm && accuracy >= lesson.minAccuracy) {
      placementIndex = i;
    } else {
      break;
    }
  }
  // Never place someone straight into Pro Certification off one cold
  // sample - three separate passes are required there regardless, and
  // starting mid-lesson-sequence-but-at-the-end reads as a bug, not a win.
  const lastNonCertIndex = lessonSequence.length - 2;
  const clampedIndex = Math.min(placementIndex, Math.max(lastNonCertIndex, 0));
  return lessonSequence[clampedIndex].id;
}

/** Rough WPM/accuracy calculation shared with the lesson runner. */
export function computeTypingStats({ targetText, typedText, elapsedSeconds }) {
  const minutes = Math.max(elapsedSeconds / 60, 1 / 60);
  const wordsTyped = typedText.trim().length / 5; // standard "word" = 5 chars
  const wpm = wordsTyped / minutes;

  let correct = 0;
  const len = Math.min(targetText.length, typedText.length);
  for (let i = 0; i < len; i += 1) {
    if (targetText[i] === typedText[i]) correct += 1;
  }
  const accuracy = typedText.length > 0 ? (correct / typedText.length) * 100 : 0;

  return {
    wpm: Math.max(0, Math.round(wpm * 10) / 10),
    accuracy: Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10)),
  };
}