export type RecordedField = 'name' | 'contact' | 'preferred_time' | 'comment';
export interface VoiceRecording {
  mime_type: 'audio/webm' | 'audio/ogg' | 'audio/mp4';
  data_base64: string;
}
export const VOICE_RECORDING_MAX_BYTES = 1024 * 1024;
export const VOICE_FIELD_LABELS: Record<RecordedField, string> = {
  name: 'Имя', contact: 'Контакт', preferred_time: 'Удобное время', comment: 'Тема консультации',
};

export async function encodeVoiceRecording(blob: Blob): Promise<VoiceRecording> {
  const mime_type = blob.type.split(';')[0];
  if (!['audio/webm', 'audio/ogg', 'audio/mp4'].includes(mime_type) || !blob.size || blob.size > VOICE_RECORDING_MAX_BYTES) {
    throw new Error('Не удалось подготовить аудиоответ. Повторите запись.');
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return { mime_type: mime_type as VoiceRecording['mime_type'], data_base64: btoa(binary) };
}

export function validVoiceAnswers(input: unknown): boolean {
  if (input === undefined || input === null) return true;
  if (typeof input !== 'object' || Array.isArray(input)) return false;
  return Object.entries(input).every(([field, value]) => {
    if (!Object.hasOwn(VOICE_FIELD_LABELS, field) || !value || typeof value.data_base64 !== 'string'
      || !['audio/webm', 'audio/ogg', 'audio/mp4'].includes(value.mime_type)
      || value.data_base64.length > 4 * Math.ceil(VOICE_RECORDING_MAX_BYTES / 3)
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data_base64)) return false;
    try {
      const data = atob(value.data_base64);
      return data.length > 0 && data.length <= VOICE_RECORDING_MAX_BYTES && (value.mime_type === 'audio/webm'
        ? data.startsWith('\x1a\x45\xdf\xa3') : value.mime_type === 'audio/ogg' ? data.startsWith('OggS') : data.slice(4, 8) === 'ftyp');
    } catch { return false; }
  });
}
