import { describe, expect, it, beforeAll } from 'vitest';

beforeAll(() => {
  global.window = {
    SpeechRecognition: class FakeSpeechRecognition {},
    webkitSpeechRecognition: null,
  };
});

describe('speech-to-text recognition event guards', () => {
  it('accepts events only from the active recognition instance', async () => {
    const { __speechToTextTest } = await import('../assets/js/speech-to-text.js');
    const currentRecognition = { id: 'current' };
    const previousRecognition = { id: 'previous' };
    const activeState = { recognition: currentRecognition };

    expect(__speechToTextTest.shouldHandleRecognitionEvent(activeState, activeState, currentRecognition)).toBe(true);
    expect(__speechToTextTest.shouldHandleRecognitionEvent(activeState, activeState, previousRecognition)).toBe(false);
  });

  it('ignores events from inactive dictation sessions', async () => {
    const { __speechToTextTest } = await import('../assets/js/speech-to-text.js');
    const recognition = { id: 'recognition' };
    const activeState = { recognition };
    const closedState = { recognition };

    expect(__speechToTextTest.shouldHandleRecognitionEvent(activeState, closedState, recognition)).toBe(false);
  });
});
