import { VOICE_RECORDING_MAX_BYTES, encodeVoiceRecording, validVoiceAnswers } from './voice-recordings';

it('encodes the original audio bytes without changing their content', async () => {
  const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
  const blob = { type: 'audio/webm;codecs=opus', size: bytes.length, arrayBuffer: async () => bytes.buffer } as Blob;
  const recording = await encodeVoiceRecording(blob);
  expect(recording.mime_type).toBe('audio/webm');
  expect(Array.from(atob(recording.data_base64), (character) => character.charCodeAt(0))).toEqual([...bytes]);
  expect(validVoiceAnswers({ name: recording })).toBe(true);
});

it('rejects unknown answer fields, invalid containers, and oversized recordings', async () => {
  const recording = { mime_type: 'audio/webm', data_base64: btoa('\x1a\x45\xdf\xa3') };
  expect(validVoiceAnswers({ name: recording })).toBe(true);
  expect(validVoiceAnswers({ unknown: recording })).toBe(false);
  expect(validVoiceAnswers({ name: { ...recording, data_base64: btoa('<html>') } })).toBe(false);
  await expect(encodeVoiceRecording({ type: 'audio/webm', size: VOICE_RECORDING_MAX_BYTES + 1 } as Blob)).rejects.toThrow();
});
