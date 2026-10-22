import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api, ScenarioNode, audienceLabel, indexTree, isAudience } from './api';

const node = (
  id: number,
  children: ScenarioNode[] = [],
  parent_id: number | null = null,
): ScenarioNode => ({
  id,
  audience: 'parents',
  parent_id,
  kind: 'menu',
  title: `n${id}`,
  body: null,
  image_url: null,
  audio_url: null,
  link_url: null,
  position: 0,
  is_published: true,
  children,
});

describe('api helpers', () => {
  it('isAudience accepts only the three audiences', () => {
    expect(isAudience('parents')).toBe(true);
    expect(isAudience('self')).toBe(true);
    expect(isAudience('admin')).toBe(false);
    expect(isAudience(null)).toBe(false);
  });

  it('audienceLabel returns a human label', () => {
    expect(audienceLabel('specialists')).toBe('Для специалистов');
    expect(audienceLabel(null)).toBe('');
  });

  it('indexTree flattens nested nodes by id', () => {
    const tree = [node(1, [node(2, [node(3, [], 2)], 1)]), node(4)];
    const idx = indexTree(tree);
    expect([...idx.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(idx.get(3)?.parent_id).toBe(2);
  });
});

describe('Api', () => {
  let api: Api;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(Api);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses relative /api urls in the browser', () => {
    expect(api.url('/health')).toBe('/api/health');
  });

  it('posts a consultation request', () => {
    let result: unknown;
    api
      .createRequest({
        name: 'Иван',
        contact: '@ivan',
        audience: 'self',
        comment: null,
        preferred_time: null,
        slot_id: 2,
      })
      .subscribe((r) => (result = r));
    const req = http.expectOne('/api/requests');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.slot_id).toBe(2);
    req.flush({ id: 1, status: 'new' });
    expect(result).toEqual({ id: 1, status: 'new' });
  });

  it('scenarios resource does not fetch without an audience', async () => {
    const res = TestBed.runInInjectionContext(() => api.scenarios(() => null));
    TestBed.tick();
    http.expectNone('/api/scenarios/parents');
    expect(res.value()).toBeUndefined();
  });
});
