import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkInstruction } from '../src/app/core/instructions.ts';
import { ARASAAC_BASIC_IDS, ARASAAC_SET_ID, DEFAULT_PICTOGRAM_SELECTION, buildPictogramCatalog } from '../src/app/core/pictogram-catalog.ts';
import { PICTOGRAM_BUNDLE_BYTES } from '../src/app/core/pictogram-import.ts';
import { parsePictogramBundle, pictogramTitleKey, saveImportedPictograms } from './import-pictograms.mjs';
import { defaultDisplay, normalizeDisplay, publicDisplay } from './site-display.mjs';
import { validVoiceAnswers } from '../src/app/core/voice-recordings.ts';

const arasaacIndex = JSON.parse(readFileSync(new URL('../../shared/pictograms/arasaac-index.json', import.meta.url), 'utf8'));
const catalog = buildPictogramCatalog(arasaacIndex);

const timestamp = () => new Date().toISOString();
const audiences = new Set(['self', 'parents', 'specialists']);
const statuses = new Set(['new', 'clarifying', 'matched', 'confirmed', 'done', 'cancelled']);
const requestSteps = {
  clarify: [['new'], 'clarifying'],
  accept: [['clarifying', 'matched'], 'confirmed'],
  complete: [['confirmed'], 'done'],
  no_consultation: [['new', 'clarifying', 'matched'], 'done'],
};
const noConsultationReason = 'Клиенту не нужна консультация';
const demoEmail = 'demo@kolibri.test';
const demoPassword = 'kolibri-demo';
const cleanUser = ({ password, is_archived = false, ...user }) => ({ ...user, is_archived });
const ordered = (rows) => [...rows].sort((a, b) => a.position - b.position || a.id - b.id);
const error = (res, code, detail) => res.status(code).json({ detail });
const allocate = (store, collection) => store.sequence[collection]++;
const topicSeed = [
  { id: 1, title: 'Здоровье', description: 'Подготовка к приёму врача.' },
  { id: 2, title: 'Документы', description: '' },
  { id: 3, title: 'Покупки', description: '' },
  { id: 4, title: 'Безопасность', description: '' },
  { id: 5, title: 'Другие сценарии', description: '' },
];
const seedTopic = { 1: 3, 2: 4 };
const nodeSeed = [
  ['self', 'Здоровье', 'Подготовка к приёму врача.'],
  ['self', 'Документы', 'Уточните в организации, какие документы нужно взять с собой.'],
  ['parents', 'Как помочь близкому', 'Спросите, нужна ли помощь. Дайте человеку время выбрать.'],
  ['specialists', 'Материалы для работы', 'Используйте короткие фразы и показывайте одно действие за раз.'],
];

function makeStore(path) {
  try {
    const existing = JSON.parse(readFileSync(path, 'utf8'));
    if (['everyday', 'health'].includes(existing.pictogram_selection?.set_id)) {
      existing.pictogram_selection = { ...existing.pictogram_selection, set_id: DEFAULT_PICTOGRAM_SELECTION.set_id };
    }
    const selection = existing.pictogram_selection;
    if (selection?.set_id === 'arasaac-basic') {
      const selected = new Set(selection.pictogram_ids);
      const selectedWholeSet = ARASAAC_BASIC_IDS.every((id) => selected.has(id));
      const fullSet = catalog.sets.find((set) => set.id === ARASAAC_SET_ID);
      existing.pictogram_selection = {
        set_id: ARASAAC_SET_ID,
        pictogram_ids: selectedWholeSet ? fullSet.pictogram_ids : selection.pictogram_ids,
      };
    }
    existing.topics ??= topicSeed.map((topic) => ({ ...topic }));
    existing.callbacks ??= [];
    existing.sequence.callbacks ??= existing.callbacks.reduce((next, row) => Math.max(next, row.id + 1), 1);
    existing.sequence.topics ??= Math.max(0, ...existing.topics.map((topic) => topic.id)) + 1;
    for (const instruction of existing.instructions) {
      if (instruction.topic_id === undefined) {
        instruction.topic_id = seedTopic[instruction.id] ?? (instruction.is_published ? 5 : null);
      }
    }
    return existing;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  const now = timestamp();
  return {
    sequence: { instructions: 1, topics: 6, nodes: 5, requests: 1, callbacks: 1, slots: 1, users: 2 },
    topics: topicSeed.map((topic) => ({ ...topic })),
    instructions: [],
    nodes: nodeSeed.map(([audience, title, body], index) => ({
      id: index + 1, audience, title, body, parent_id: null, kind: 'answer', image_url: null,
      audio_url: null, link_url: null, position: index, is_published: true, updated_at: now,
    })),
    settings: [
      { key: 'registration_open', value: 'true', description: null },
    ],
    users: [{ id: 1, email: demoEmail, password: demoPassword, name: 'Демо сотрудник', is_active: true, created_at: now }],
    requests: [], callbacks: [], slots: [],
  };
}

function validInstruction(value) {
  const target = (v) => v === null || typeof v === 'string';
  const short = (v, limit) => typeof v === 'string' && v.length <= limit;
  const media = (v) => v === null || short(v, 2048) && /^(https?:\/\/|\/(?!\/))/.test(v);
  return value && short(value.title, 120) && short(value.description, 500)
    && media(value.title_audio_url ?? null) && media(value.description_audio_url ?? null)
    && typeof value.is_published === 'boolean'
    && (value.topic_id === null || Number.isSafeInteger(value.topic_id))
    && target(value.start_step_id) && Array.isArray(value.steps) && value.steps.length <= 100
    && value.steps.every((s) => s && short(s.id, 100) && s.id.length > 0 && short(s.title, 160)
      && short(s.body, 4000) && media(s.image_url) && media(s.audio_url) && media(s.title_audio_url ?? null)
      && target(s.next_id)
      && (s.audio_body_start === undefined || s.audio_url && Number.isFinite(s.audio_body_start)
        && s.audio_body_start > 0 && s.audio_body_start < 1)
      && Array.isArray(s.choices) && s.choices.length <= 20 && s.choices.every((c) =>
        c && short(c.id, 100) && c.id.length > 0 && short(c.label, 160) && target(c.next_id) &&
        media(c.image_url ?? null) && media(c.audio_url ?? null))
      && new Set(s.choices.map((choice) => choice.id)).size === s.choices.length);
}

export function createMockApi(dataFile) {
  const app = express();
  const store = makeStore(dataFile);
  const imported = store.pictogram_sets ??= [];
  const mediaDirectory = join(dirname(dataFile), 'media');
  const pictogramDirectory = join(dirname(dataFile), 'pictograms');
  const sessions = new Map();
  const save = () => {
    mkdirSync(dirname(dataFile), { recursive: true });
    writeFileSync(dataFile + '.tmp', JSON.stringify(store, null, 2), { mode: 0o600 });
    renameSync(dataFile + '.tmp', dataFile);
  };
  const booked = (id) => store.requests.some((r) => r.slot_id === id && r.status !== 'cancelled');
  const find = (collection, id) => store[collection].find((record) => record.id === Number(id));
  const display = () => store.site_display ?? defaultDisplay;
  const roleExists = (key) => display().roles.some((role) => role.key === key);
  const visibleRole = (key) => display().roles.some((role) => role.key === key && !role.is_hidden);
  const employeeName = (id) => {
    const user = find('users', id);
    return user ? user.name || 'Сотрудник' : null;
  };
  const slotOut = (slot) => ({
    ...slot, specialist_id: slot.specialist_id ?? null,
    specialist_name: employeeName(slot.specialist_id),
  });
  const requestOut = ({ history: _history, voice_answers, ...value }) => {
    const slot = find('slots', value.slot_id);
    return {
      ...value, slot: slot ? slotOut(slot) : null, specialist_id: value.specialist_id,
      voice_fields: Object.keys(voice_answers ?? {}),
      specialist_name: employeeName(value.specialist_id),
    };
  };
  const availableSlot = (id) => {
    const slot = find('slots', id);
    return (slot?.is_open || slot?.is_private) && !booked(id)
      && (slot.specialist_id == null || find('users', slot.specialist_id)?.is_active);
  };
  const event = (row, kind, status, occurred_at, actor = null) => ({
    id: row.history.length + 1, kind, status, occurred_at,
    actor_id: actor?.id ?? null, actor_name: actor ? actor.name || actor.email
      : kind === 'created' ? String(row.name ?? '').slice(0, 200) || null : null,
    specialist_name: employeeName(row.specialist_id),
  });
  const requestSnapshot = (request) => ({
    status: request.status, contact: request.contact,
    audience: request.audience ?? null,
    time: find('slots', request.slot_id)?.starts_at ?? request.preferred_time ?? null,
    specialist: employeeName(request.specialist_id), comment: request.comment ?? null,
    closure_reason: request.closure_reason ?? null,
  });
  const addCallbackRequest = (callback) => {
    const row = {
      id: allocate(store, 'requests'), contact: callback.phone, name: null,
      audience: null, comment: null, preferred_time: null, slot_id: null, specialist_id: null,
      closure_reason: null, status: 'new', created_at: callback.created_at,
      updated_at: callback.created_at, history: [],
    };
    row.history.push(event(row, 'created', row.status, row.created_at));
    callback.request_id = row.id;
    store.requests.push(row);
  };
  const legacyCallbacks = store.callbacks.filter((callback) => callback.request_id == null);
  if (legacyCallbacks.length) {
    for (const callback of legacyCallbacks) addCallbackRequest(callback);
    save();
  }
  for (const row of store.requests) {
    if (row.specialist_id === undefined) row.specialist_id = find('slots', row.slot_id)?.specialist_id ?? null;
    if (row.history) continue;
    row.history = [];
    row.history.push(event(row, 'created', 'new', row.created_at));
    if (row.status !== 'new') row.history.push(event(row, 'snapshot', row.status, row.updated_at));
  }
  const registrationOpen = () => store.settings.find((item) => item.key === 'registration_open')?.value !== 'false';
  const published = (audience) => store.instructions.filter((item) =>
    item.is_published && visibleRole(item.audience) && (!audience || audience === item.audience));
  const admin = (req, res, next) => {
    const auth = req.get('authorization') ?? '';
    const user = find('users', sessions.get(auth.slice(7)));
    if (!auth.startsWith('Bearer ') || !user?.is_active || user.is_archived) return error(res, 401, 'Войдите в админку.');
    res.locals.user = user;
    next();
  };
  const visibleTree = (audience) => {
    if (!visibleRole(audience)) return [];
    const eligible = ordered(store.nodes.filter((n) => n.audience === audience && n.is_published));
    const build = (parent, trail) => eligible.filter((n) => n.parent_id === parent && !trail.has(n.id)).map((n) =>
      ({ ...n, children: build(n.id, new Set([...trail, n.id])) }));
    return build(null, new Set());
  };

  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.post('/api/admin/pictograms/import', admin, express.json({ limit: PICTOGRAM_BUNDLE_BYTES }), (req, res) => {
    let bundle;
    try {
      bundle = parsePictogramBundle(req.body);
    } catch (e) {
      return error(res, 422, e.message);
    }
    const key = pictogramTitleKey(bundle.title);
    const existing = imported.find(({ set }) => pictogramTitleKey(set.title) === key);
    if (existing?.fingerprint === bundle.fingerprint) {
      return res.json({ set: existing.set, pictograms: existing.pictograms });
    }
    if (existing || catalog.sets.some(({ title }) => pictogramTitleKey(title) === key)) {
      return error(res, 409, 'Набор с таким названием уже существует.');
    }
    try {
      return res.status(201).json(saveImportedPictograms(bundle, pictogramDirectory, (record) => {
        imported.push(record);
        try { save(); } catch (e) { imported.pop(); throw e; }
      }));
    } catch {
      return error(res, 500, 'Не удалось сохранить набор. Попробуйте ещё раз.');
    }
  }, (err, _req, res, _next) => {
    if (err.status === 413) return error(res, 413, 'Набор должен занимать не более 16 МБ.');
    return error(res, 422, 'Выберите файл JSON.');
  });
  app.get('/api/pictogram-images/:id', (req, res) => {
    const id = req.params.id;
    const mime = /^[a-f0-9]{32}$/.test(id) && imported.find(({ mediaTypes }) => mediaTypes[id])?.mediaTypes[id];
    if (!mime) return error(res, 404, 'Пиктограмма не найдена.');
    return res.type(mime).set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }).sendFile(id, {
      root: pictogramDirectory, maxAge: '1y', immutable: true,
    });
  });
  app.use('/api/requests', express.json({ limit: '6mb' }));
  app.use(express.json({ limit: '512kb' }));
  app.use('/api/instruction-media', express.static(mediaDirectory, {
    index: false,
    setHeaders: (res, path) => {
      if (path.endsWith('.webm')) res.setHeader('Content-Type', 'audio/webm');
    },
  }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'local-demo' }));
  app.get('/api/settings', (_req, res) => res.json(Object.fromEntries(store.settings.map((s) => [s.key, s.value]))));
  app.get('/api/site-display', (_req, res) => res.json(publicDisplay(display())));
  app.get('/api/scenarios/:audience', (req, res) => res.json(visibleTree(req.params.audience)));
  app.get('/api/nodes/:id', (req, res) => {
    const node = find('nodes', req.params.id);
    if (!node?.is_published) return error(res, 404, 'Раздел не найден.');
    // Черновой предок скрывает всю ветвь.
    const tree = visibleTree(node.audience);
    if (!function has(nodes) { return nodes.some((n) => n.id === node.id || has(n.children)); }(tree)) {
      return error(res, 404, 'Раздел не найден.');
    }
    res.json(node);
  });
  app.get('/api/instruction-topics', (req, res) => {
    const used = new Set(published(req.query.audience).map((item) => item.topic_id));
    res.json(store.topics.filter((topic) => used.has(topic.id)));
  });
  app.get('/api/instructions', (req, res) => res.json(published(req.query.audience)
    .filter((i) => req.query.topic_id === undefined || i.topic_id === Number(req.query.topic_id))
    .map(({ id, title, description, title_audio_url, description_audio_url, audience, steps, start_step_id }) => ({
      id, title, description, title_audio_url, description_audio_url, audience,
      image_url: steps.find((step) => step.id === start_step_id)?.image_url ?? null,
    }))));
  app.get('/api/instructions/:id', (req, res) => {
    const value = find('instructions', req.params.id);
    return value?.is_published && visibleRole(value.audience)
      ? res.json(value) : error(res, 404, 'Инструкция не найдена.');
  });
  app.post('/api/callback-requests', (req, res) => {
    const { phone, consent, idempotency_key: key } = req.body ?? {};
    const idempotency_key = typeof key === 'string' ? key.trim() : '';
    if (typeof phone !== 'string' || !/^\+[1-9]\d{9,14}$/.test(phone) || consent !== true
        || !idempotency_key || idempotency_key.length > 100) {
      return error(res, 422, 'Проверьте номер и подтвердите согласие.');
    }
    const existing = store.callbacks.find((r) => r.idempotency_key === idempotency_key);
    if (existing && existing.phone !== phone) return error(res, 409, 'Этот запрос уже был отправлен с другим номером.');
    if (existing) return res.json({ id: existing.id, status: 'received', demo: true });
    const record = { id: allocate(store, 'callbacks'), phone, consent, idempotency_key, created_at: timestamp() };
    addCallbackRequest(record);
    store.callbacks.push(record);
    try { save(); } catch {
      store.callbacks.pop();
      store.requests.pop();
      return error(res, 500, 'Не удалось сохранить заявку. Попробуйте ещё раз.');
    }
    res.status(201).json({ id: record.id, status: 'received', demo: true });
  });
  app.get('/api/slots', (_req, res) => res.json(registrationOpen()
    ? store.slots.filter((s) => s.is_open && !booked(s.id)
        && (s.specialist_id == null || find('users', s.specialist_id)?.is_active)).map(slotOut)
    : []));
  app.post('/api/requests', (req, res) => {
    if (!registrationOpen()) return error(res, 409, 'Запись на консультацию закрыта.');
    const { name, contact, audience, comment, preferred_time, slot_id } = req.body ?? {};
    if (!validVoiceAnswers(req.body?.voice_answers)) return error(res, 422, 'Проверьте аудиоответы.');
    if (typeof contact !== 'string' || contact.trim().length < 3 || contact.length > 200
        || (name != null && (typeof name !== 'string' || !name.length || name.length > 120))) {
      return error(res, 422, 'Проверьте контакт.');
    }
    if (audience != null && !visibleRole(audience)) return error(res, 422, 'Выберите доступную роль.');
    const slot = find('slots', slot_id);
    if (slot_id != null && (!slot?.is_open || booked(slot.id) ||
        (slot.specialist_id != null && !find('users', slot.specialist_id)?.is_active))) {
      return error(res, 409, 'Это время уже недоступно.');
    }
    const now = timestamp();
    const record = { id: allocate(store, 'requests'), name: name ?? null, contact, audience, comment, preferred_time, slot_id,
      voice_answers: req.body.voice_answers ?? {},
      status: 'new', specialist_id: find('slots', slot_id)?.specialist_id ?? null,
      created_at: now, updated_at: now, history: [] };
    record.history.push(event(record, 'created', 'new', now));
    store.requests.push(record);
    try { save(); } catch {
      store.requests.pop();
      return error(res, 500, 'Не удалось сохранить заявку. Попробуйте ещё раз.');
    }
    res.status(201).json({ ...requestOut(record), demo: true });
  });

  app.post('/api/admin/login', (req, res) => {
    const user = store.users.find((u) => u.email === req.body?.email && u.password === req.body?.password
      && u.is_active && !u.is_archived);
    if (!user) return error(res, 401, 'Неверная почта или пароль.');
    const token = randomUUID();
    sessions.set(token, user.id);
    res.json({ token, user: cleanUser(user) });
  });
  app.use('/api/admin', admin);
  app.get('/api/admin/requests/:id/voice/:field', (req, res) => {
    const answer = find('requests', req.params.id)?.voice_answers?.[req.params.field];
    if (!answer) return error(res, 404, 'Аудиоответ не найден.');
    res.set('X-Content-Type-Options', 'nosniff').type(answer.mime_type).send(Buffer.from(answer.data_base64, 'base64'));
  });
  app.get('/api/admin/site-display', (_req, res) => res.json({ revision: 0, ...display() }));
  app.put('/api/admin/site-display', (req, res) => {
    const value = normalizeDisplay(req.body);
    if (!value) return error(res, 422, 'Проверьте названия ролей и ссылки кнопок.');
    const revision = display().revision ?? 0;
    if (req.body.revision !== undefined && req.body.revision !== revision) {
      return error(res, 409, 'Настройки уже изменились. Обновите страницу и повторите.');
    }
    value.revision = revision + 1;
    const previous = { site_display: store.site_display, instructions: store.instructions, nodes: store.nodes };
    const keys = new Set(value.roles.map(({ key }) => key));
    const removed = new Set(display().roles.filter(({ key }) => !keys.has(key)).map(({ key }) => key));
    const now = timestamp();
    const unpublish = (item) => item.is_published && removed.has(item.audience)
      ? { ...item, is_published: false, updated_at: now } : item;
    store.site_display = value;
    store.instructions = store.instructions.map(unpublish);
    store.nodes = store.nodes.map(unpublish);
    try { save(); } catch {
      Object.assign(store, previous);
      return error(res, 500, 'Не удалось сохранить настройки.');
    }
    return res.json(value);
  });
  app.get('/api/admin/pictograms', (_req, res) => res.json({
    sets: [...catalog.sets, ...imported.map(({ set }) => set)],
    pictograms: [...catalog.pictograms, ...imported.flatMap(({ pictograms }) => pictograms)],
    selection: store.pictogram_selection ?? DEFAULT_PICTOGRAM_SELECTION,
  }));
  app.put('/api/admin/pictograms', (req, res) => {
    const { set_id, pictogram_ids } = req.body ?? {};
    const set = catalog.sets.find(({ id }) => id === set_id) ?? imported.find(({ set }) => set.id === set_id)?.set;
    const allowed = new Set(set?.pictogram_ids);
    if (!set || !Array.isArray(pictogram_ids) || pictogram_ids.length > set.pictogram_ids.length
      || new Set(pictogram_ids).size !== pictogram_ids.length || !pictogram_ids.every((id) => allowed.has(id))) {
      return error(res, 422, 'Выберите пиктограммы из указанного набора.');
    }
    const previous = store.pictogram_selection;
    store.pictogram_selection = { set_id, pictogram_ids };
    try {
      save();
    } catch {
      store.pictogram_selection = previous;
      return error(res, 500, 'Не удалось сохранить подборку. Попробуйте ещё раз.');
    }
    res.json(store.pictogram_selection);
  });
  const uploadTypes = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
    'audio/webm': 'webm', 'audio/ogg': 'ogg',
  };
  app.post('/api/admin/instruction-media', express.raw({ type: ['image/*', 'audio/*'], limit: '8mb' }), (req, res) => {
    const type = (req.get('content-type') ?? '').split(';')[0];
    const extension = uploadTypes[type];
    if (!extension || !Buffer.isBuffer(req.body) || !req.body.length) return error(res, 422, 'Выберите файл изображения или аудио.');
    const name = randomUUID() + '.' + extension;
    mkdirSync(mediaDirectory, { recursive: true });
    writeFileSync(join(mediaDirectory, name), req.body, { flag: 'wx', mode: 0o600 });
    res.status(201).json({ url: '/api/instruction-media/' + name });
  });
  app.get('/api/admin/me', (_req, res) => res.json(cleanUser(res.locals.user)));
  app.post('/api/admin/me/password', (req, res) => {
    const { current_password, new_password } = req.body ?? {};
    if (res.locals.user.password !== current_password || typeof new_password !== 'string' || new_password.length < 8) {
      return error(res, 422, 'Проверьте текущий пароль и новый пароль.');
    }
    res.locals.user.password = new_password;
    save();
    res.sendStatus(204);
  });
  app.get('/api/admin/users', (req, res) => {
    const archived = req.query.archived === 'true';
    return res.json(store.users.filter((user) => Boolean(user.is_archived) === archived).map(cleanUser));
  });
  app.post('/api/admin/users', (req, res) => {
    const { email, name, password } = req.body ?? {};
    if (!email || !name || typeof password !== 'string' || password.length < 8) return error(res, 422, 'Заполните данные сотрудника.');
    if (store.users.some((u) => u.email === email)) return error(res, 409, 'Такая почта уже используется.');
    const u = { id: allocate(store, 'users'), email, name, password, is_active: true, created_at: timestamp() };
    store.users.push(u);
    save();
    res.status(201).json(cleanUser(u));
  });
  app.patch('/api/admin/users/:id/active', (req, res) => {
    const u = find('users', req.params.id);
    if (!u) return error(res, 404, 'Сотрудник не найден.');
    if (u.id === res.locals.user.id && req.query.active === 'false') return error(res, 422, 'Нельзя отключить собственную учётную запись.');
    if (u.is_archived) return error(res, 409, 'Сначала верните сотрудника из архива.');
    u.is_active = req.query.active === 'true';
    save();
    res.json(cleanUser(u));
  });
  app.patch('/api/admin/users/:id/archive', (req, res) => {
    const u = find('users', req.params.id);
    if (!u) return error(res, 404, 'Сотрудник не найден.');
    if (u.id === res.locals.user.id) return error(res, 400, 'Нельзя архивировать собственную учётную запись.');
    if (!['true', 'false'].includes(req.query.archived)) return error(res, 422, 'Укажите состояние архива.');
    const archived = req.query.archived === 'true';
    if (Boolean(u.is_archived) === archived) return res.json(cleanUser(u));
    const previous = { is_archived: u.is_archived, is_active: u.is_active };
    u.is_archived = archived;
    u.is_active = !archived;
    try { save(); } catch {
      Object.assign(u, previous);
      return error(res, 500, 'Не удалось сохранить сотрудника.');
    }
    res.json(cleanUser(u));
  });
  app.get('/api/admin/instructions', (req, res) => res.json(store.instructions.filter((i) => !req.query.audience || i.audience === req.query.audience)));
  app.get('/api/admin/instruction-topics', (_req, res) => res.json(store.topics));
  app.post('/api/admin/instruction-topics', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!title || title.length > 80 || description.length > 160) return error(res, 422, 'Проверьте название и описание темы.');
    if (store.topics.some((topic) => topic.title.toLowerCase() === title.toLowerCase())) {
      return error(res, 409, 'Тема с таким названием уже есть.');
    }
    const topic = { id: allocate(store, 'topics'), title, description };
    store.topics.push(topic);
    save();
    res.status(201).json(topic);
  });
  app.get('/api/admin/instructions/:id', (req, res) => {
    const i = find('instructions', req.params.id);
    return i ? res.json(i) : error(res, 404, 'Инструкция не найдена.');
  });
  const writeInstruction = (req, res, existing) => {
    const i = req.body;
    if (!validInstruction(i) || !roleExists(i.audience)) return error(res, 422, 'Проверьте роль, шаги и заполненные поля.');
    if (!i.topic_id || !find('topics', i.topic_id)) return error(res, 422, 'Выберите существующую тему.');
    if (i.is_published) {
      const issues = checkInstruction(i);
      if (issues.length) return error(res, 422, issues[0].message);
    }
    const { title, description, audience, topic_id, is_published, start_step_id, steps } = i;
    const now = timestamp();
    const value = {
      id: existing?.id ?? allocate(store, 'instructions'), title, description, audience, topic_id,
      title_audio_url: i.title_audio_url === undefined ? existing?.title_audio_url ?? null : i.title_audio_url,
      description_audio_url: i.description_audio_url === undefined ? existing?.description_audio_url ?? null : i.description_audio_url,
      is_published, start_step_id, steps, created_at: existing?.created_at ?? now, updated_at: now,
    };
    if (existing) Object.assign(existing, value);
    else store.instructions.push(value);
    save();
    res.status(existing ? 200 : 201).json(value);
  };
  app.post('/api/admin/instructions', (req, res) => writeInstruction(req, res));
  app.put('/api/admin/instructions/:id', (req, res) => {
    const i = find('instructions', req.params.id);
    return i ? writeInstruction(req, res, i) : error(res, 404, 'Инструкция не найдена.');
  });
  app.delete('/api/admin/instructions/:id', (req, res) => {
    if (!find('instructions', req.params.id)) return error(res, 404, 'Инструкция не найдена.');
    store.instructions = store.instructions.filter((i) => i.id !== Number(req.params.id));
    save();
    res.sendStatus(204);
  });
  app.get('/api/admin/nodes', (req, res) => res.json(ordered(store.nodes.filter((n) => !req.query.audience || n.audience === req.query.audience))));
  const saveNode = (req, res, existing) => {
    const { audience, parent_id, kind, title, body, image_url, audio_url, link_url, position, is_published } = { ...existing, ...req.body };
    if (!audiences.has(audience) || typeof title !== 'string' || !title.trim() || title.length > 120
        || !['menu', 'answer', 'consult', 'donate', 'volunteer', 'link'].includes(kind)) return error(res, 422, 'Проверьте название и тип раздела.');
    const seen = new Set(existing ? [existing.id] : []);
    for (let current = parent_id; current != null;) {
      const p = find('nodes', current);
      if (!p || p.audience !== audience || seen.has(p.id)) return error(res, 422, 'Выберите другой родительский раздел.');
      seen.add(p.id);
      current = p.parent_id;
    }
    const node = { id: existing?.id ?? allocate(store, 'nodes'), audience, parent_id, kind, title, body, image_url, audio_url, link_url, position, is_published, updated_at: timestamp() };
    if (existing) Object.assign(existing, node);
    else store.nodes.push(node);
    save();
    res.status(existing ? 200 : 201).json(node);
  };
  app.post('/api/admin/nodes', (req, res) => saveNode(req, res));
  app.patch('/api/admin/nodes/:id', (req, res) => {
    const n = find('nodes', req.params.id);
    return n ? saveNode(req, res, n) : error(res, 404, 'Раздел не найден.');
  });
  app.delete('/api/admin/nodes/:id', (req, res) => {
    const node = find('nodes', req.params.id);
    if (!node) return error(res, 404, 'Раздел не найден.');
    const ids = new Set([node.id]);
    const queue = [node.id];
    while (queue.length) {
      const id = queue.pop();
      for (const n of store.nodes.filter((item) => item.parent_id === id && !ids.has(item.id))) {
        ids.add(n.id);
        queue.push(n.id);
      }
    }
    store.nodes = store.nodes.filter((n) => !ids.has(n.id));
    save();
    res.sendStatus(204);
  });
  app.get('/api/admin/settings', (_req, res) => res.json(store.settings));
  app.put('/api/admin/settings/:key', (req, res) => {
    const { value, description = null } = req.body ?? {};
    if (typeof value !== 'string') return error(res, 422, 'Введите значение.');
    const setting = { key: req.params.key, value, description };
    const index = store.settings.findIndex((s) => s.key === setting.key);
    if (index === -1) store.settings.push(setting);
    else store.settings[index] = setting;
    save();
    res.json(setting);
  });
  app.get('/api/admin/slots', (_req, res) => res.json(store.slots.map((s) => ({ ...slotOut(s), is_booked: booked(s.id) }))));
  const overlaps = (start, end, specialistId, ignoredId) => store.slots.some((slot) =>
    slot.id !== ignoredId && slot.specialist_id === specialistId && (slot.is_open || booked(slot.id)) &&
    Date.parse(slot.starts_at) < Date.parse(end) && Date.parse(start) < Date.parse(slot.ends_at));
  app.post('/api/admin/slots', (req, res) => {
    const { starts_at, ends_at, specialist_id, is_open = true } = req.body ?? {};
    if (!Number.isSafeInteger(specialist_id) || !find('users', specialist_id)?.is_active) {
      return error(res, 422, 'Выберите действующего специалиста.');
    }
    if (!(Date.parse(ends_at) > Date.parse(starts_at))) return error(res, 422, 'Время окончания должно быть позже начала.');
    if (overlaps(starts_at, ends_at, specialist_id)) {
      return error(res, 409, 'У этого специалиста уже есть слот в это время.');
    }
    const slot = { id: allocate(store, 'slots'), starts_at, ends_at, is_open, specialist_id };
    store.slots.push(slot);
    save();
    res.status(201).json({ ...slotOut(slot), is_booked: false });
  });
  app.patch('/api/admin/slots/:id', (req, res) => {
    const slot = find('slots', req.params.id);
    const specialistId = req.body?.specialist_id;
    if (!slot) return error(res, 404, 'Слот не найден.');
    if (!Number.isSafeInteger(specialistId) || !find('users', specialistId)?.is_active) {
      return error(res, 422, 'Выберите действующего специалиста.');
    }
    if (slot.specialist_id != null && booked(slot.id)) return error(res, 409, 'За этим слотом уже закреплена запись.');
    if (overlaps(slot.starts_at, slot.ends_at, specialistId, slot.id)) {
      return error(res, 409, 'У этого специалиста уже есть слот в это время.');
    }
    slot.specialist_id = specialistId;
    save();
    res.json({ ...slotOut(slot), is_booked: booked(slot.id) });
  });
  app.delete('/api/admin/slots/:id', (req, res) => {
    const slot = find('slots', req.params.id);
    if (!slot) return error(res, 404, 'Время не найдено.');
    if (booked(slot.id)) return error(res, 409, 'Это время уже занято.');
    store.slots = store.slots.filter((s) => s.id !== slot.id);
    save();
    res.sendStatus(204);
  });
  const filteredRequests = (status, specialistId) => {
    const selected = [].concat(status ?? []);
    return store.requests.filter((r) => !selected.length || selected.includes(r.status))
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
      .map(requestOut)
      .filter((r) => specialistId === undefined || r.specialist_id === specialistId);
  };
  app.get('/api/admin/requests', (req, res) => res.json(filteredRequests(req.query.status,
    req.query.scope === 'mine' ? res.locals.user.id : undefined)));
  app.get('/api/admin/callback-requests', (_req, res) => res.json([...store.callbacks]
    .sort((a, b) => b.id - a.id)
    .map(({ id, phone, created_at }) => ({ id, phone, created_at, status: 'received' }))));
  app.get('/api/admin/requests/export.csv', (_req, res) => {
    const cell = (v) => '"' + String(v ?? '').replace(/^[=+@\-\t\r\n]/, (m) => "'" + m).replaceAll('"', '""') + '"';
    const csv = [['id', 'создана', 'контакт', 'аудитория', 'слот', 'желаемое время', 'статус', 'специалист', 'комментарий', 'причина закрытия'],
      ...store.requests.map((r) => [r.id, r.created_at, r.contact, r.audience, find('slots', r.slot_id)?.starts_at,
        r.preferred_time, r.status, employeeName(r.specialist_id), r.comment, r.closure_reason])];
    res.type('text/csv').send(csv.map((row) => row.map(cell).join(',')).join('\n'));
  });
  app.get('/api/admin/requests/calendar.ics', (req, res) => {
    const rows = filteredRequests(req.query.status, res.locals.user.id)
      .filter((row) => row.status !== 'cancelled' && row.slot);
    if (!rows.length) return error(res, 404, 'У вас нет записей с выбранным временем для экспорта.');
    const utc = (value) => new Date(value).toISOString().replace(/[-:]|\.\d{3}/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kolibri//Calendar//RU', 'CALSCALE:GREGORIAN'];
    for (const row of rows) {
      lines.push('BEGIN:VEVENT', 'UID:consultation-' + row.id + '@kolibri.test',
        'DTSTAMP:' + utc(row.updated_at), 'DTSTART:' + utc(row.slot.starts_at),
        'DTEND:' + utc(row.slot.ends_at), 'SUMMARY:Консультация Колибри',
        'STATUS:' + (['confirmed', 'done'].includes(row.status) ? 'CONFIRMED' : 'TENTATIVE'), 'END:VEVENT');
    }
    res.type('text/calendar').attachment('kolibri.ics').send(lines.concat('END:VCALENDAR', '').join('\r\n'));
  });
  app.patch('/api/admin/requests/:id', (req, res) => {
    const request = find('requests', req.params.id);
    if (!request) return error(res, 404, 'Заявка не найдена.');
    const body = req.body ?? {};
    const explicit = Object.hasOwn(body, 'specialist_id');
    const { action, details } = body;
    const actor = res.locals.user;
    if (request.status === 'done' && (action === 'cancel' || body.status === 'cancelled')) {
      return error(res, 409, 'Завершённую заявку нельзя отменить.');
    }
    const allowed = action === 'accept' ? ['action', 'details'] : [action ? 'action' : 'details'];
    if ((Object.hasOwn(body, 'action') || Object.hasOwn(body, 'details'))
        && (Object.keys(body).some((key) => !allowed.includes(key)) || (!action && !details))) {
      return error(res, 422, 'Передайте одно действие с заявкой.');
    }
    if ((Object.hasOwn(body, 'status') && !statuses.has(body.status)) || (body.take && explicit)) {
      return error(res, 422, 'Укажите статус или способ назначения.');
    }
    if (body.status === 'confirmed' && request.status !== 'confirmed') {
      return error(res, 422, 'Заполните данные заявки и назначьте встречу.');
    }
    let status = body.status;
    if (request.closure_reason && status !== undefined && status !== 'done') {
      return error(res, 409, 'Завершённую заявку нельзя вернуть в работу.');
    }
    let changes = {};
    let newSlot;
    const before = requestSnapshot(request);
    if (Object.hasOwn(requestSteps, action)) {
      const [allowed, target] = requestSteps[action];
      if (!allowed.includes(request.status)) return error(res, 409, 'Статус заявки уже изменился.');
      if (action === 'accept' && !details?.appointment) {
        return error(res, 422, 'Заполните данные заявки и назначьте встречу.');
      }
      status = target;
      if (action === 'no_consultation') {
        changes = { closure_reason: noConsultationReason, slot_id: null };
      }
    } else if (action === 'cancel') {
      status = 'cancelled';
    } else if (action === 'restore') {
      if (!['cancelled', 'done'].includes(request.status)) {
        return error(res, 409, 'Вернуть можно только завершённую или отменённую заявку.');
      }
      status = request.history.findLast((entry) => entry.status !== request.status)?.status ?? 'new';
      if (request.closure_reason != null) changes.closure_reason = null;
      const oldSlot = find('slots', request.slot_id);
      if (request.status === 'cancelled' && request.slot_id != null && (!availableSlot(request.slot_id)
          || (oldSlot.is_private && overlaps(oldSlot.starts_at, oldSlot.ends_at, oldSlot.specialist_id, oldSlot.id)))) {
        changes.slot_id = null;
      }
    } else if (action !== undefined) {
      return error(res, 422, 'Неизвестное действие с заявкой.');
    }
    if (details) {
      if (action !== 'accept' && request.status !== 'confirmed') {
        return error(res, 409, 'Данные можно изменить, пока заявка ожидает встречи.');
      }
      const { contact, audience, comment = null, appointment, expected_updated_at } = details;
      const { specialist_id, starts_at } = appointment ?? {};
      const start = Date.parse(starts_at);
      if (expected_updated_at !== request.updated_at) {
        return error(res, 409, 'Заявка уже обновилась. Откройте её данные заново.');
      }
      if (Object.hasOwn(details, 'name')
          || typeof contact !== 'string' || contact.trim().length < 3 || contact.trim().length > 200
          || !audiences.has(audience) || (comment !== null && typeof comment !== 'string')) {
        return error(res, 422, 'Проверьте заполнение полей.');
      }
      if (!Number.isSafeInteger(specialist_id) || !find('users', specialist_id)?.is_active
          || typeof starts_at !== 'string' || !/(Z|[+-]\d\d:\d\d)$/i.test(starts_at)
          || !Number.isFinite(start)) {
        return error(res, 422, 'Укажите время и действующего специалиста.');
      }

      const current = find('slots', request.slot_id);
      let slotId = request.slot_id ?? null;
      const sameTime = (slot) => slot.specialist_id === specialist_id && Date.parse(slot.starts_at) === start;
      if (!current || !sameTime(current)) {
        const existing = store.slots.find((slot) => slot.is_open && sameTime(slot));
        const duration = current ? Date.parse(current.ends_at) - Date.parse(current.starts_at) : 30 * 60_000;
        const end = new Date(start + duration).toISOString();
        if (existing ? !availableSlot(existing.id)
          : overlaps(starts_at, end, specialist_id, current && !current.is_open ? current.id : undefined)) {
          return error(res, 409, 'Это время у специалиста уже занято.');
        }
        if (existing) {
          slotId = existing.id;
        } else {
          newSlot = { starts_at: new Date(start).toISOString(), ends_at: end, is_open: false,
            is_private: true, specialist_id };
        }
      }
      changes = Object.fromEntries(Object.entries({
        contact: contact.trim(), audience, comment, slot_id: slotId,
      }).filter(([key, value]) => (request[key] ?? null) !== value));
    }
    const take = body.take === true;
    if (take && request.specialist_id !== null && request.specialist_id !== actor.id) {
      return error(res, 409, 'Заявку уже принял другой сотрудник.');
    }
    const assignedId = details?.appointment?.specialist_id ?? (take ? actor.id : body.specialist_id);
    const assigned = (explicit || take || !!details?.appointment) && request.specialist_id !== assignedId;
    if (assigned && assignedId !== null
        && (!Number.isSafeInteger(assignedId) || !find('users', assignedId)?.is_active)) {
      return error(res, 422, 'Выберите действующего сотрудника.');
    }
    const statusChanged = status !== undefined && status !== request.status;
    if (!assigned && !statusChanged && !newSlot && !Object.keys(changes).length) return res.json(requestOut(request));
    if (action !== 'restore' && request.slot_id != null && request.status === 'cancelled'
        && statusChanged && booked(request.slot_id)) return error(res, 409, 'Время этой заявки уже занято.');
    const previous = { ...request };
    const slotSequence = store.sequence.slots;
    const now = timestamp();
    if (newSlot) {
      newSlot.id = allocate(store, 'slots');
      changes.slot_id = newSlot.id;
      store.slots.push(newSlot);
    }
    Object.assign(request, changes);
    if (assigned) request.specialist_id = assignedId;
    if (statusChanged) request.status = status;
    request.updated_at = now;
    const kind = action === 'restore' ? 'restored' : details && !statusChanged ? 'edited'
      : assigned && statusChanged ? 'updated' : assigned ? 'assignment' : 'status';
    const changesInHistory = Object.entries(requestSnapshot(request))
      .filter(([field, value]) => before[field] !== value)
      .map(([field, value]) => ({ field, before: before[field], after: value }));
    request.history = [...request.history, { ...event(request, kind, request.status, now, actor), changes: changesInHistory }];
    try { save(); } catch {
      Object.assign(request, previous);
      if (newSlot) {
        store.slots.pop();
        store.sequence.slots = slotSequence;
      }
      return error(res, 500, 'Не удалось сохранить изменения.');
    }
    res.json(requestOut(request));
  });
  app.get('/api/admin/requests/:id/history', (req, res) => {
    const request = find('requests', req.params.id);
    return request ? res.json(request.history) : error(res, 404, 'Заявка не найдена.');
  });
  app.use('/api', (_req, res) => error(res, 404, 'Эндпоинт не найден.'));
  return app;
}

export async function startMock({ port = 3077, dataFile = fileURLToPath(new URL('../.demo-data/store.json', import.meta.url)) } = {}) {
  const server = createServer(createMockApi(dataFile));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
