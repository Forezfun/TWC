import defaults from '../../shared/site/display.json' with { type: 'json' };

export const defaultDisplay = defaults;
const keyPattern = /^(self|parents|specialists|role-[a-z0-9-]{1,42})$/;

function url(value, allowLocal = false) {
  if (value === null) return true;
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return false;
  if (allowLocal && /^\/(?!\/)/.test(value)) return true;
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username
      && /^https?:\/\//i.test(value);
  } catch {
    return false;
  }
}

export function publicDisplay(display) {
  const roles = display.roles.filter((role) => !role.is_hidden);
  const keys = new Set(roles.map(({ key }) => key));
  return {
    revision: display.revision ?? 0,
    roles,
    donate: { ...display.donate, role_keys: display.donate.role_keys.filter((key) => keys.has(key)) },
    volunteer: { ...display.volunteer, role_keys: display.volunteer.role_keys.filter((key) => keys.has(key)) },
  };
}

export function normalizeDisplay(value) {
  const text = (value, min, max) => typeof value === 'string'
    && value.trim().length >= min && value.trim().length <= max;
  if (!Array.isArray(value?.roles) || value.roles.length > 100) return null;
  const roles = [];
  for (const role of value.roles) {
    if (typeof role?.key !== 'string' || !keyPattern.test(role.key) || !text(role.title, 1, 120)
      || !text(role.hint, 0, 200) || !url(role.audio_url, true)
      || !url(role.hint_audio_url ?? null, true) || !url(role.icon_url ?? null, true)
      || (role.is_hidden !== undefined && typeof role.is_hidden !== 'boolean')) return null;
    roles.push({ key: role.key, title: role.title.trim(), hint: role.hint.trim(),
      audio_url: role.audio_url, hint_audio_url: role.hint_audio_url ?? null, icon_url: role.icon_url ?? null,
      is_hidden: role.is_hidden ?? false });
  }
  const keys = new Set(roles.map(({ key }) => key));
  if (keys.size !== roles.length || new Set(roles.map(({ title }) => title.toLowerCase())).size !== roles.length) return null;
  const result = { roles };
  for (const key of ['donate', 'volunteer']) {
    const button = value[key];
    if (!text(button?.label, 1, 60) || !url(button.url) || !Array.isArray(button.role_keys)
      || new Set(button.role_keys).size !== button.role_keys.length
      || !button.role_keys.every((role) => keys.has(role))) return null;
    result[key] = { label: button.label.trim(), url: button.url, role_keys: [...button.role_keys] };
  }
  return result;
}
