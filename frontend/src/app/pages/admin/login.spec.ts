import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminLogin } from './login';

describe('AdminLogin', () => {
  let fixture: ComponentFixture<AdminLogin>;
  let http: HttpTestingController;
  const el = () => fixture.nativeElement as HTMLElement;

  function fill(email: string, password: string) {
    for (const [sel, value] of [
      ['input[formControlName="email"]', email],
      ['input[formControlName="password"]', password],
    ] as const) {
      const input = el().querySelector(sel) as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AdminLogin],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminLogin);
    fixture.detectChanges();
  });

  it('keeps the button disabled until the form is valid', () => {
    const btn = el().querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fill('not-an-email', 'x');
    expect(btn.disabled).toBe(true);
    fill('a@example.com', 'x');
    expect(btn.disabled).toBe(false);
  });

  it('navigates to /admin after a successful login', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fill('a@example.com', 'secret');
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    const req = http.expectOne('/api/admin/login');
    expect(req.request.body).toEqual({ email: 'a@example.com', password: 'secret' });
    req.flush({
      token: 'jwt',
      user: { id: 1, email: 'a@example.com', name: '', is_active: true, created_at: '' },
    });
    expect(navigate).toHaveBeenCalledWith(['/admin']);
  });

  it('shows the server message on a failed login and keeps the form', () => {
    fill('a@example.com', 'wrong');
    (el().querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    http
      .expectOne('/api/admin/login')
      .flush({ detail: 'Неверная почта или пароль' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain(
      'Неверная почта или пароль',
    );
    expect((el().querySelector('input[formControlName="email"]') as HTMLInputElement).value).toBe(
      'a@example.com',
    );
  });
});
