import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
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

  it('renders three audience tiles with links', () => {
    const tiles = fixture.nativeElement.querySelectorAll('a.tile') as NodeListOf<HTMLAnchorElement>;
    expect(tiles.length).toBe(3);
    expect([...tiles].map((t) => t.getAttribute('href'))).toEqual([
      '/self',
      '/parents',
      '/specialists',
    ]);
  });

  it('has a staff login link at the bottom', () => {
    const link = fixture.nativeElement.querySelector('.staff-link a') as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/admin/login');
    expect(link.textContent).toContain('Вход для сотрудников');
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
});
