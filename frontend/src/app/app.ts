import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { NavState } from './core/nav';
import { isRoleKey } from './core/site-display';
import { Speech } from './core/speech';
import { Prefs } from './core/prefs';
import { ActionDock } from './ui/action-dock';

@Component({
  imports: [RouterOutlet, RouterLink, NgTemplateOutlet, NgOptimizedImage],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly prefs = inject(Prefs);
  protected readonly speech = inject(Speech);
  private readonly dock = inject(ActionDock);
  protected readonly nav = inject(NavState);
  private readonly router = inject(Router);

  protected readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  protected readonly path = computed(() => this.url().split('?')[0]);
  protected readonly dockTemplate = computed(() => {
    this.url();
    const view = this.dock.view();
    return view && view.route === this.router.routerState.root.firstChild ? view.template : null;
  });
  protected readonly supportTemplate = computed(() => {
    this.url();
    const view = this.dock.support();
    return view && view.route === this.router.routerState.root.firstChild ? view.template : null;
  });
  protected readonly isAdmin = computed(() => this.path().startsWith('/admin') && this.path() !== '/admin/preview');
  protected readonly helpLink = computed(() =>
    this.path() === '/help' ? this.router.parseUrl(this.url()).queryParams : { return: this.url() },
  );

  constructor() {
    effect(() => {
      this.url();
      this.speech.stop();
    });
  }

  protected back(): void {
    this.speech.stop();
    const override = this.nav.backAction();
    if (override) {
      override();
      return;
    }
    const [section, id] = this.path().split('/').filter(Boolean);
    if (id && isRoleKey(section)) {
      const parent = this.nav.parentId();
      void this.router.navigate(parent ? ['/', section, parent] : ['/', section]);
      return;
    }
    void this.router.navigate(['/sections']);
  }
}
