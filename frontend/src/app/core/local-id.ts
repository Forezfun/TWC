/** Generates IDs on localhost and when the demo is opened over Wi-Fi HTTP. */
export function localId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
