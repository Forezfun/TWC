import { NgOptimizedImage } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, signal } from '@angular/core';

@Component({
  selector: 'twc-pictogram-thumbnail',
  imports: [NgOptimizedImage],
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()' },
  styles: [':host { position: relative; display: block; max-inline-size: 100%; overflow: hidden; } img { object-fit: contain; object-position: center; padding: 2px; }'],
  template: `
    @if (visible()) {
      <img [ngSrc]="url()" alt="" fill loading="lazy" decoding="async" />
    }
  `,
})
export class PictogramThumbnail {
  readonly url = input.required<string>();
  readonly size = input.required<number>();
  protected readonly visible = signal(false);

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.visible.set(true);
        return;
      }
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0)) {
          this.visible.set(true);
          observer.disconnect();
        }
      }, { threshold: 0.01 });
      observer.observe(element);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
}
