import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_SITE_DISPLAY } from '../../core/site-display';
import { AdminRequests } from './requests';

it('shows the next available actions for each request status', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AdminRequests);
  fixture.detectChanges();

  const http = TestBed.inject(HttpTestingController);
  const states = ['new', 'clarifying', 'matched', 'confirmed', 'done', 'cancelled'];
  const requests = states.map((status, index) => ({
    id: index + 1, status, contact: index === 0 ? '+79990000001' : 'test@example.test',
    audience: null, slot: null, slot_id: null, specialist_id: null, preferred_time: null, comment: null,
    created_at: '2030-11-18T12:00:00Z', updated_at: '2030-11-18T12:00:00Z',
  }));
  http.expectOne('/api/site-display').flush(DEFAULT_SITE_DISPLAY);
  http.expectOne('/api/admin/users').flush([]);
  http.expectOne('/api/admin/requests').flush(requests);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();

  const root: HTMLElement = fixture.nativeElement;
  expect(root.querySelector('a[href="tel:+79990000001"]')).toBeTruthy();
  expect([...root.querySelectorAll('th')].map((header) => header.textContent)).not.toContain('Имя');
  const actions = Array.from(root.querySelectorAll('.request-actions'), (group) =>
    Array.from(group.querySelectorAll('button'), (button) => button.textContent.trim()));
  expect(actions).toEqual([
    ['Уточнить данные у клиента'],
    ['Принять заявку', 'Клиенту не нужна консультация', 'Отменить заявку', 'История'],
    ['Принять заявку', 'Клиенту не нужна консультация', 'Отменить заявку', 'История'],
    ['Изменить данные', 'Консультация состоялась', 'Отменить встречу', 'История'],
    ['Вернуть заявку', 'История'],
    ['Вернуть заявку', 'История'],
  ]);
  [...root.querySelectorAll<HTMLButtonElement>('.request-actions button')]
    .find((button) => button.textContent.trim() === 'Клиенту не нужна консультация')!.click();
  const transition = http.expectOne('/api/admin/requests/2');
  expect(transition.request.method).toBe('PATCH');
  expect(transition.request.body).toEqual({ action: 'no_consultation' });
  const closed = { ...requests[1], status: 'done', closure_reason: 'Клиенту не нужна консультация' };
  transition.flush(closed);
  TestBed.tick();
  http.match('/api/admin/requests').forEach((refresh) => refresh.flush(requests));
  const disclosure = root.querySelector<HTMLDetailsElement>('.status-filter')!;
  disclosure.querySelector('summary')!.click();
  expect(disclosure.open).toBe(true);
  const choices = root.querySelectorAll<HTMLInputElement>('.status-options input');
  for (const choice of [choices[0], choices[4]]) choice.click();
  expect(disclosure.open).toBe(true);
  root.querySelector('thead')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  expect(disclosure.open).toBe(false);
  TestBed.tick();
  fixture.detectChanges();
  expect(disclosure.querySelector('summary')!.textContent).toContain('Статусы · 2');
  const filter = http.expectOne((candidate) =>
    candidate.url === '/api/admin/requests' && candidate.params.has('status'));
  expect(filter.request.params.getAll('status')).toEqual(['new', 'done']);
  filter.flush([closed, requests[4]]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  expect(root.querySelector('tbody .muted')?.textContent).toBe('Клиенту не нужна консультация');
  http.verify();
});

it('opens the completed request form before accepting and sends a selected specialist and meeting time', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AdminRequests);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const request = {
    id: 1, status: 'clarifying', contact: 'test@example.test', audience: 'parents',
    slot: null, slot_id: null, specialist_id: null, preferred_time: null, comment: 'Тема из заявки',
    created_at: '2030-11-18T12:00:00Z', updated_at: '2030-11-18T12:00:00Z',
  };
  http.expectOne('/api/site-display').flush(DEFAULT_SITE_DISPLAY);
  http.expectOne('/api/admin/users').flush([{ id: 4, name: 'Сотрудник', is_active: true }]);
  http.expectOne('/api/admin/requests').flush([request]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();

  const root: HTMLElement = fixture.nativeElement;
  const editor = root.querySelectorAll('dialog')[0];
  editor.showModal = () => { editor.open = true; };
  editor.close = () => { editor.open = false; };
  root.querySelector<HTMLButtonElement>('.request-actions button')!.click();
  fixture.detectChanges();
  http.expectNone('/api/admin/requests/1');
  expect(editor.open).toBe(true);
  expect(editor.querySelector('[formControlName="name"]')).toBeNull();

  const date = editor.querySelector<HTMLInputElement>('input[type="date"]')!;
  const hour = editor.querySelector<HTMLSelectElement>('select[formControlName="meeting_hour"]')!;
  const minute = editor.querySelector<HTMLSelectElement>('select[formControlName="meeting_minute"]')!;
  const staff = editor.querySelector<HTMLSelectElement>('select[formControlName="specialist_id"]')!;
  const audience = editor.querySelector<HTMLSelectElement>('select[formControlName="audience"]')!;
  const submit = editor.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(submit.disabled).toBe(true);
  expect(audience.value).toBe('parents');
  expect(Array.from(audience.options).slice(1).map(({ value }) => value)).toEqual(['self', 'parents', 'specialists']);
  expect(hour.options.length).toBe(25);
  expect(hour.options[1].value).toBe('00');
  expect(hour.options[24].value).toBe('23');
  expect(minute.options.length).toBe(61);
  expect(minute.options[60].value).toBe('59');
  date.value = '2030-11-19';
  date.dispatchEvent(new Event('input', { bubbles: true }));
  staff.selectedIndex = 1;
  staff.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
  expect(submit.disabled).toBe(true);

  hour.value = '23';
  hour.dispatchEvent(new Event('change', { bubbles: true }));
  minute.value = '30';
  minute.dispatchEvent(new Event('change', { bubbles: true }));
  fixture.detectChanges();
  expect(submit.disabled).toBe(false);
  editor.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  const mutation = http.expectOne('/api/admin/requests/1');
  expect(mutation.request.body).toEqual({
    action: 'accept',
    details: {
      contact: 'test@example.test', audience: 'parents', comment: 'Тема из заявки',
      expected_updated_at: request.updated_at,
      appointment: { starts_at: '2030-11-19T20:30:00.000Z', specialist_id: 4 },
    },
  });
  const confirmed = {
    ...request, status: 'confirmed', specialist_id: 4, slot_id: 2,
    slot: { id: 2, starts_at: '2030-11-19T20:30:00Z', ends_at: '2030-11-19T21:00:00Z' },
  };
  mutation.flush(confirmed);
  TestBed.tick();
  http.match('/api/admin/requests').forEach((refresh) => refresh.flush([confirmed]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  root.querySelector<HTMLButtonElement>('.request-actions button')!.click();
  fixture.detectChanges();
  expect(editor.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2030-11-19');
  expect(editor.querySelector<HTMLSelectElement>('[formControlName="meeting_hour"]')?.value).toBe('23');
  expect(editor.querySelector<HTMLSelectElement>('[formControlName="meeting_minute"]')?.value).toBe('30');
  http.verify();
});
