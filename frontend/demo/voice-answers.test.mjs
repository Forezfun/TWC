import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startMock } from './mock-api.mjs';

test('saves private audio with a request and keeps it across demo restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'twc-voice-api-'));
  const dataFile = join(directory, 'store.json');
  let server;
  try {
    server = await startMock({ port: 0, dataFile });
    let base = `http://127.0.0.1:${server.address().port}/api`;
    const audio = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]);
    const response = await fetch(base + '/requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Проверка', contact: '@voice-test', audience: 'self',
        voice_answers: { name: { mime_type: 'audio/webm', data_base64: audio.toString('base64') } } }),
    });
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.deepEqual(result.voice_fields, ['name']);
    assert.equal(result.voice_answers, undefined);
    const path = `/admin/requests/${result.id}/voice/name`;
    assert.equal((await fetch(base + path)).status, 401);
    await new Promise((resolve) => server.close(resolve));
    server = await startMock({ port: 0, dataFile });
    base = `http://127.0.0.1:${server.address().port}/api`;
    const login = await fetch(base + '/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@kolibri.test', password: 'kolibri-demo' }),
    });
    const headers = { Authorization: `Bearer ${(await login.json()).token}` };
    const saved = await fetch(base + path, { headers });
    assert.equal(saved.status, 200);
    assert.equal(saved.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()), audio);
    const list = await (await fetch(base + '/admin/requests', { headers })).json();
    assert.deepEqual(list[0].voice_fields, ['name']);
    assert.equal(JSON.stringify(list).includes('data_base64'), false);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
