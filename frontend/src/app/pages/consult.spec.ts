import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeRu from '@angular/common/locales/ru';
import { Consult } from './consult';

registerLocaleData(localeRu);

/** httpResource кладёт значение в микрозадаче: ждём её, затем прогоняем эффекты и рендер. */
async function settle(fixture: { detectChanges(): void }): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  TestBed.tick();
  fixture.detectChanges();
}

describe('Consult', () => {
  let fixture: ComponentFixture<Consult>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    const q = convertToParamMap({ audience: 'parents', topic: 'Школа' });
    await TestBed.configureTestingModule({
      imports: [Consult],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(q), snapshot: { queryParamMap: q } },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Consult);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/slots').flush([
      {
        id: 7,
        starts_at: '2026-10-28T12:00:00Z',
        ends_at: '2026-10-28T12:30:00Z',
        is_open: true,
      },
    ]);
    await settle(fixture);
  });

  function setInput(selector: string, value: string) {
    const input = el().querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('prefills audience and topic from query params', () => {
    const c = fixture.componentInstance as unknown as {
      form: { value: { audience: string; comment: string } };
    };
    expect(c.form.value.audience).toBe('parents');
    expect(c.form.value.comment).toBe('Школа');
  });

  it('does not go to confirmation with empty required fields', () => {
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el().querySelector('h1')!.textContent).toContain('Запись на консультацию');
    expect(el().querySelectorAll('.error').length).toBe(2);
  });

  it('shows confirmation, then posts the request and shows success', async () => {
    setInput('input[formControlName="name"]', 'Иван');
    setInput('input[formControlName="contact"]', '@ivan');
    const slot = el().querySelector(
      'input[type="radio"][formControlName="slot_id"]',
    ) as HTMLInputElement;
    slot.click();
    fixture.detectChanges();

    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(el().querySelector('h1')!.textContent).toContain('Проверьте данные');
    expect(el().querySelector('.kv')!.textContent).toContain('@ivan');

    const buttons = [...el().querySelectorAll('button')];
    buttons.find((b) => b.textContent!.includes('Отправить заявку'))!.click();
    const req = http.expectOne('/api/requests');
    expect(req.request.body).toEqual({
      name: 'Иван',
      contact: '@ivan',
      audience: 'parents',
      comment: 'Школа',
      preferred_time: null,
      slot_id: 7,
    });
    req.flush({ id: 1, name: 'Иван', contact: '@ivan', status: 'new', slot: null });
    await settle(fixture);
    expect(el().querySelector('h1')!.textContent).toContain('Заявка отправлена');
  });

  it('keeps data and explains a 409 when the slot is taken', async () => {
    setInput('input[formControlName="name"]', 'Иван');
    setInput('input[formControlName="contact"]', '@ivan');
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    [...el().querySelectorAll('button')]
      .find((b) => b.textContent!.includes('Отправить заявку'))!
      .click();
    http
      .expectOne('/api/requests')
      .flush({ detail: 'Это время уже занято' }, { status: 409, statusText: 'Conflict' });
    await settle(fixture);
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Это время уже занято');
    expect(el().querySelector('.kv')!.textContent).toContain('Иван');
    http.expectOne('/api/slots').flush([]);
  });
});
