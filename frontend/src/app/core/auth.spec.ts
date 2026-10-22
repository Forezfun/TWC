import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { Auth, adminGuard, authInterceptor } from './auth';

const USER = {
  id: 1,
  email: 'a@example.com',
  name: 'A',
  is_active: true,
  created_at: '2026-10-22T00:00:00Z',
};

describe('Auth', () => {
  let auth: Auth;
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    auth = TestBed.inject(Auth);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => http.verify());

  it('starts logged out and restores a saved session', () => {
    expect(auth.loggedIn()).toBe(false);
    localStorage.setItem('twc-admin', JSON.stringify({ token: 't', user: USER }));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const restored = TestBed.inject(Auth);
    expect(restored.loggedIn()).toBe(true);
    expect(restored.user()?.email).toBe('a@example.com');
  });

  it('login stores token and user, logout clears them', () => {
    let user: unknown;
    auth.login('a@example.com', 'pw').subscribe((u) => (user = u));
    const req = http.expectOne('/api/admin/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ token: 'jwt', user: USER });
    expect(user).toEqual(USER);
    expect(auth.token()).toBe('jwt');
    expect(JSON.parse(localStorage.getItem('twc-admin')!).token).toBe('jwt');

    auth.logout();
    expect(auth.loggedIn()).toBe(false);
    expect(localStorage.getItem('twc-admin')).toBeNull();
  });

  it('interceptor adds Bearer only to admin calls', () => {
    auth.token.set('jwt');
    client.get('/api/admin/requests').subscribe();
    client.get('/api/settings').subscribe();
    expect(http.expectOne('/api/admin/requests').request.headers.get('Authorization')).toBe(
      'Bearer jwt',
    );
    expect(http.expectOne('/api/settings').request.headers.has('Authorization')).toBe(false);
    http.match(() => true).forEach((r) => r.flush({}));
  });

  it('interceptor logs out and redirects on 401 from admin api', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.token.set('expired');
    let failed = false;
    client.get('/api/admin/requests').subscribe({ error: () => (failed = true) });
    http
      .expectOne('/api/admin/requests')
      .flush({ detail: 'x' }, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    expect(auth.loggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/admin/login']);
  });

  it('guard allows logged-in users and redirects others to login', () => {
    const run = () => TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
    const tree = run() as UrlTree;
    expect(tree instanceof UrlTree && tree.toString()).toBe('/admin/login');
    auth.token.set('jwt');
    expect(run()).toBe(true);
  });
});
