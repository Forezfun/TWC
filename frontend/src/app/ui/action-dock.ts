import { Directive, Injectable, OnDestroy, OnInit, TemplateRef, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class ActionDock {
  readonly view = signal<{ route: ActivatedRoute; template: TemplateRef<unknown> } | null>(null);
  readonly support = signal<{ route: ActivatedRoute; template: TemplateRef<unknown> } | null>(null);
}

@Directive({ selector: 'ng-template[twcActions]' })
export class ActionDockTemplate implements OnInit, OnDestroy {
  private readonly dock = inject(ActionDock);
  readonly twcActions = input<'' | 'support'>('');
  private readonly view = {
    route: inject(ActivatedRoute),
    template: inject<TemplateRef<unknown>>(TemplateRef),
  };
  ngOnInit(): void { this.slot().set(this.view); }
  ngOnDestroy(): void {
    const slot = this.slot();
    if (slot() === this.view) slot.set(null);
  }
  private slot() {
    return this.twcActions() === 'support' ? this.dock.support : this.dock.view;
  }
}
