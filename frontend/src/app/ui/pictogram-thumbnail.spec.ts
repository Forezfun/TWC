import { TestBed } from '@angular/core/testing';
import { PictogramThumbnail } from './pictogram-thumbnail';

afterEach(() => vi.unstubAllGlobals());

it('выставляет URL изображения только при пересечении карточкой видимой области', () => {
  let observeEntries!: (entries: Partial<IntersectionObserverEntry>[]) => void;
  const disconnect = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: typeof observeEntries) { observeEntries = callback; }
    observe() {}
    disconnect = disconnect;
  });
  const fixture = TestBed.createComponent(PictogramThumbnail);
  fixture.componentRef.setInput('size', 44);
  fixture.componentRef.setInput('url', '/api/pictogram-images/example');
  fixture.detectChanges();
  const thumbnail: HTMLElement = fixture.nativeElement;
  observeEntries([{ isIntersecting: false, intersectionRatio: 0 }]);
  fixture.detectChanges();
  expect(thumbnail.querySelector('img')).toBeNull();

  observeEntries([{ isIntersecting: true, intersectionRatio: 0.5 }]);
  fixture.detectChanges();
  expect(thumbnail.querySelector('img')?.getAttribute('src')).toBe('/api/pictogram-images/example');
  expect(disconnect).toHaveBeenCalledOnce();
});
