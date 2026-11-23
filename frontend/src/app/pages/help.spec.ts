import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from '../app';
import { routes } from '../app.routes';
import { Prefs } from '../core/prefs';

describe('Help callback', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;
  const root = () => fixture.nativeElement as HTMLElement;
  const button = (text: string) => [...root().querySelectorAll('button')]
    .find((candidate) => candidate.textContent?.trim().startsWith(text))!;
  const click = (text: string) => { button(text).click(); fixture.detectChanges(); };
  const enter = (value: string) => {
    const input = root().querySelector<HTMLInputElement>('input[type="tel"]')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [App], providers: [
      provideRouter(routes), provideHttpClient(), provideHttpClientTesting(),
    ] });
    TestBed.inject(Prefs).sound.set(true);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await TestBed.inject(Router).navigateByUrl('/help');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('offers only a callback and keeps invalid digits with a separate error speaker', () => {
    expect(root().querySelectorAll('.sound-card .tile')).toHaveLength(1);
    expect(root().textContent).not.toContain('Записаться на консультацию');
    expect(root().querySelector('twc-voice-answer')).toBeNull();
    click('Позвоните мне');
    enter('+7');
    click('Проверить номер');
    expect(root().querySelector<HTMLInputElement>('input[type="tel"]')!.value).toBe('+7');
    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Проверьте цифры');
    expect(root().querySelector('[role="alert"] twc-fragment-sound button')).toBeTruthy();
    http.expectNone('/api/callback-requests');
  });

  it('asks for consent, sends once and confirms only after the server receipt', () => {
    click('Позвоните мне');
    enter('8 (999) 000-00-01');
    click('Проверить номер');
    expect(root().querySelector('h1')?.textContent).toContain('Передать номер сотруднику?');
    expect(root().textContent).toContain('+79990000001');
    http.expectNone('/api/callback-requests');
    const send = button('Да, передать номер');
    send.click();
    send.click();
    fixture.detectChanges();
    expect(root().querySelector('h1')?.textContent).toContain('Отправляем заявку');
    const request = http.expectOne('/api/callback-requests');
    expect(request.request.body).toEqual({ phone: '+79990000001', consent: true, idempotency_key: expect.any(String) });
    request.flush({ id: 1, status: 'received', demo: true });
    fixture.detectChanges();
    expect(root().querySelector('h1')?.textContent).toContain('Учебная заявка сохранена');
  });

  it('retries a failed send with the same number and idempotency key', () => {
    click('Позвоните мне');
    enter('+79990000002');
    click('Проверить номер');
    click('Да, передать номер');
    const first = http.expectOne('/api/callback-requests');
    first.flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(root().querySelector('h1')?.textContent).toContain('Заявка не отправлена');
    click('Попробовать ещё раз');
    const retry = http.expectOne('/api/callback-requests');
    expect(retry.request.body).toEqual(first.request.body);
    retry.flush({ id: 2, status: 'received' });
    fixture.detectChanges();
    expect(root().querySelector('h1')?.textContent).toContain('Заявка отправлена');
  });

  it('redirects old consultation links to help and preserves return to the instruction', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/consult?return=%2Finstructions%2F5');
    fixture.detectChanges();
    expect(router.parseUrl(router.url).root.children['primary'].segments[0].path).toBe('help');
    expect(router.parseUrl(router.url).queryParams['return']).toBe('/instructions/5');
    expect(root().querySelector('a[href="/instructions/5"]')?.textContent).toContain('Вернуться к инструкции');
    expect(root().textContent).not.toContain('легче сказать');
  });
});
