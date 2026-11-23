import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { startMock } from './mock-api.mjs';

test('callbacks need no login, are private, survive a restart and do not duplicate on retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'twc-callback-api-'));
  const dataFile = join(directory, 'store.json');
  let server;
  try {
    server = await startMock({ port: 0, dataFile });
    let base = `http://127.0.0.1:${server.address().port}/api`;
    const payload = { phone: '+79990000001', consent: true, idempotency_key: 'callback-test' };
    const post = (value = payload) => fetch(base + '/callback-requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    assert.equal((await fetch(base + '/admin/requests')).status, 401);
    assert.equal((await post({ ...payload, consent: false })).status, 422);
    assert.equal((await post({ ...payload, phone: '+7' })).status, 422);

    // Не подтверждаем сохранение, если запись на диск не удалась.
    await mkdir(dataFile + '.tmp');
    assert.equal((await post()).status, 500);
    await rm(dataFile + '.tmp', { recursive: true });
    const created = await post();
    assert.equal(created.status, 201);
    const receipt = await created.json();
    assert.equal(receipt.status, 'received');
    assert.equal(receipt.demo, true);
    const retry = await post();
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).id, receipt.id);
    assert.equal((await post({ ...payload, phone: '+79990000002' })).status, 409);
    await new Promise((resolve) => server.close(resolve));
    const legacyPhone = '+79990000003';
    const legacyTime = '2026-11-19T14:07:00Z';
    const data = JSON.parse(await readFile(dataFile, 'utf8'));
    data.callbacks.push({
      id: data.sequence.callbacks++, phone: legacyPhone, created_at: legacyTime,
      consent: true, idempotency_key: 'legacy-callback',
    });
    await writeFile(dataFile, JSON.stringify(data));
    server = await startMock({ port: 0, dataFile });
    base = `http://127.0.0.1:${server.address().port}/api`;
    const login = () => fetch(base + '/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@kolibri.test', password: 'kolibri-demo' }),
    });
    const headers = { Authorization: `Bearer ${(await (await login()).json()).token}` };
    const response = await fetch(base + '/admin/requests', { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const rows = await response.json();
    assert.equal(rows.length, 2);
    const row = rows.find((item) => item.contact === payload.phone);
    const migrated = rows.find((item) => item.contact === legacyPhone);
    assert.equal(row.status, 'new');
    assert.equal(row.name, null);
    assert.equal(row.slot, null);
    assert.equal(row.idempotency_key, undefined);
    assert.equal(migrated.created_at, legacyTime);
    const change = (item, body) => fetch(base + '/admin/requests/' + item.id, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const closed = await change(row, { action: 'no_consultation' });
    assert.equal(closed.status, 200);
    const reason = 'Клиенту не нужна консультация';
    assert.equal((await closed.json()).closure_reason, reason);
    const history = await (await fetch(base + '/admin/requests/' + row.id + '/history', { headers })).json();
    assert.equal(history.at(-1).status, 'done');
    assert.deepEqual(history.at(-1).changes.find(({ field }) => field === 'closure_reason'),
      { field: 'closure_reason', before: null, after: reason });
    const clarified = await (await change(migrated, { action: 'clarify' })).json();
    assert.equal(clarified.status, 'clarifying');
    const appointment = await change(migrated, {
      action: 'accept',
      details: {
        contact: legacyPhone, audience: 'self', expected_updated_at: clarified.updated_at,
        appointment: { starts_at: '2030-11-18T15:30:00Z', specialist_id: 1 },
      },
    });
    assert.equal(appointment.status, 200);
    assert.equal((await appointment.json()).status, 'confirmed');
    await new Promise((resolve) => server.close(resolve));
    server = await startMock({ port: 0, dataFile });
    base = `http://127.0.0.1:${server.address().port}/api`;
    headers.Authorization = `Bearer ${(await (await login()).json()).token}`;
    const saved = await (await fetch(base + '/admin/requests', { headers })).json();
    assert.equal(saved.length, 2);
    assert.equal(saved.find((item) => item.id === migrated.id).status, 'confirmed');
    assert.equal(saved.find((item) => item.id === row.id).closure_reason, reason);
  } finally {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
