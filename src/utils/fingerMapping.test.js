import { createFingerMapping, getFingerInstruction } from './fingerMapping';

describe('finger mapping', () => {
  test.each([
    ['a', 'left-pinky', false], ['f', 'left-index', false], ['j', 'right-index', false], [';', 'right-pinky', false],
    ['1', 'left-pinky', false], ['5', 'left-index', false], ['0', 'right-pinky', false],
    ['!', 'left-pinky', true], ['@', 'left-ring', true], ['_', 'right-pinky', true], ['?', 'right-pinky', true],
  ])('%s maps to %s', (character, finger, needsShift) => {
    expect(getFingerInstruction(character)).toMatchObject({ finger, needsShift });
  });

  test('maps space to either thumb', () => {
    expect(getFingerInstruction(' ')).toMatchObject({ key: 'Space', finger: 'thumbs', needsShift: false });
  });

  test('supports configurable overrides', () => {
    const mapping = createFingerMapping({ q: { key: 'Q', finger: 'right-pinky', needsShift: false } });
    expect(getFingerInstruction('q', mapping).finger).toBe('right-pinky');
  });
});
