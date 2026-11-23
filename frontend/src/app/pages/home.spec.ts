import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DEFAULT_SITE_DISPLAY, SiteDisplayApi } from '../core/site-display';
import { Home } from './home';

/** httpResource кладёт значение в микрозадаче: ждём её, затем прогоняем эффекты и рендер. */
async function settle(fixture: { detectChanges(): void }): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  TestBed.tick();
  fixture.detectChanges();
}

describe('Home', () => {
  let fixture: ComponentFixture<Home>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Home);
    fixture.detectChanges();
  });

  it('renders three audience tiles with links', async () => {
    http.expectOne('/api/site-display').flush(DEFAULT_SITE_DISPLAY);
    await settle(fixture);
    const tiles = fixture.nativeElement.querySelectorAll('.audience-list a.tile') as NodeListOf<HTMLAnchorElement>;
    expect(tiles.length).toBe(3);
    expect([...tiles].map((t) => t.getAttribute('href'))).toEqual([
      '/self',
      '/parents',
      '/specialists',
    ]);
  });

  it('keeps the staff entry out of the public page', () => {
    expect(fixture.nativeElement.querySelector('a[href^="/admin"]')).toBeNull();
  });

  it('shows welcome text from settings without duplicating the greeting', async () => {
    TestBed.tick();
    http
      .expectOne('/api/settings')
      .flush({ welcome_text: 'Здравствуйте! я помогу найти информацию.' });
    await settle(fixture);
    const text = fixture.nativeElement.querySelector('.body-text').textContent.trim();
    expect(text).toBe('Я помогу найти информацию.');
  });

  it('shows a saved role and its pictogram in the open menu', async () => {
    http.expectOne('/api/settings').flush({});
    http.expectOne('/api/site-display').flush(DEFAULT_SITE_DISPLAY);
    await settle(fixture);
    const settings = structuredClone(DEFAULT_SITE_DISPLAY);
    const icon = '/kolibri/pictograms/help.svg';
    settings.roles.push({
      key: 'role-family', title: 'Помогаю семье', hint: '', audio_url: null, icon_url: icon,
    });
    settings.roles[0].is_hidden = true;

    TestBed.inject(SiteDisplayApi).save(settings).subscribe();
    http.expectOne('/api/admin/site-display').flush(settings);
    await settle(fixture);
    const tile = fixture.nativeElement.querySelector('a[href="/role-family"]');
    expect(tile?.textContent).toContain('Помогаю семье');
    expect(tile?.querySelector('twc-pictogram-thumbnail img')?.getAttribute('src')).toBe(icon);
    expect(fixture.nativeElement.querySelector('a[href="/self"]')).toBeNull();

    window.dispatchEvent(new StorageEvent('storage', { key: 'twc-site-display-changed' }));
    TestBed.tick();
    http.expectOne('/api/site-display').flush({
      ...settings, roles: settings.roles.filter((role) => !role.is_hidden),
    });
    http.verify();
  });
});
