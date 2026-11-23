/** Разрешаем только внутренние адреса публичной части. */
export function publicReturn(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/sections';
  const path = value.split(/[?#]/)[0];
  return /^(\/|\/(intro|sections|help|consult|self|parents|specialists|instructions)(\/\d+)?)$/.test(path)
    ? value : '/sections';
}
