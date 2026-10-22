import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Topics } from './topics';

function routeWith(audience: string) {
  return { paramMap: of(new Map([['audience', audience]])) };
}

/** httpResource кладёт значение в микрозадаче: ждём её, затем прогоняем эффекты и рендер. */
async function settle(fixture: { detectChanges(): void }): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  TestBed.tick();
  fixture.detectChanges();
}

describe('Topics', () => {
  let http: HttpTestingController;

  async function setup(audience: string): Promise<ComponentFixture<Topics>> {
    await TestBed.configureTestingModule({
      imports: [Topics],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: routeWith(audience) },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(Topics);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  it('loads the tree for the audience and renders tiles', async () => {
    const fixture = await setup('parents');
    http.expectOne('/api/scenarios/parents').flush([
      {
        id: 1,
        audience: 'parents',
        parent_id: null,
        kind: 'menu',
        title: 'Обучение',
        body: null,
        image_url: null,
        audio_url: null,
        link_url: null,
        position: 0,
        is_published: true,
        children: [],
      },
      {
        id: 2,
        audience: 'parents',
        parent_id: null,
        kind: 'donate',
        title: 'Поддержать',
        body: null,
        image_url: null,
        audio_url: null,
        link_url: null,
        position: 1,
        is_published: true,
        children: [],
      },
    ]);
    await settle(fixture);
    const tiles = fixture.nativeElement.querySelectorAll('a.tile') as NodeListOf<HTMLAnchorElement>;
    expect(tiles.length).toBe(2);
    expect(tiles[0].getAttribute('href')).toBe('/parents/1');
    expect(tiles[0].textContent).toContain('Обучение');
    expect(tiles[1].classList.contains('tile--donate')).toBe(true);
  });

  it('shows a retry card on error', async () => {
    const fixture = await setup('self');
    http
      .expectOne('/api/scenarios/self')
      .flush('fail', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('.card--danger')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.card--danger button').textContent).toContain(
      'Повторить',
    );
  });

  it('redirects home for an unknown audience', async () => {
    const navigate = vi.spyOn(Router.prototype, 'navigate').mockResolvedValue(true);
    await setup('nope');
    expect(navigate).toHaveBeenCalledWith(['/']);
    http.expectNone((r) => r.url.includes('/scenarios/'));
  });
});
