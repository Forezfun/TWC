import { Component, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Prefs, TextSize } from './core/prefs';
import { Speech } from './core/speech';
import { isAudience } from './core/api';
import { NavState } from './core/nav';

@Component({
  imports: [RouterOutlet, RouterLink],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly prefs = inject(Prefs);
  private readonly speech = inject(Speech);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly nav = inject(NavState);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly settingsOpen = signal(false);
  protected readonly isHome = computed(() => this.url().split('?')[0] === '/');
  protected readonly isAdmin = computed(() => this.url().startsWith('/admin'));

  /** Куда ведёт «К темам»: к темам текущей аудитории или на главную. */
  protected readonly topicsLink = computed(() => {
    const first = this.url().split('?')[0].split('/')[1];
    return isAudience(first) ? ['/', first] : ['/'];
  });

  protected readonly sizes: { key: TextSize; label: string }[] = [
    { key: 'md', label: 'Обычный' },
    { key: 'lg', label: 'Крупный' },
    { key: 'xl', label: 'Очень крупный' },
  ];

  protected back(): void {
    this.speech.stop();
    const path = this.url().split('?')[0];
    const parts = path.split('/').filter(Boolean);
    // Внутри сценария «Назад» ведёт на уровень выше, а не в историю браузера (правило 11)
    if (parts.length >= 2 && isAudience(parts[0])) {
      const parent = this.nav.parentId();
      void this.router.navigate(parent ? ['/', parts[0], parent] : ['/', parts[0]]);
      return;
    }
    if (parts.length === 1 && isAudience(parts[0])) {
      void this.router.navigate(['/']);
      return;
    }
    this.location.back();
  }

  protected toggleSettings(): void {
    this.settingsOpen.update((v) => !v);
  }
}
