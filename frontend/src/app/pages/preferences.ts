import { Component, DestroyRef, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NavState } from '../core/nav';
import { publicReturn } from '../core/return-path';
import { Spoken } from '../ui/spoken';
import { PreferencesControls } from '../ui/preferences';
import { ActionDockTemplate } from '../ui/action-dock';
import { ArasaacCredit } from '../ui/arasaac-credit';

@Component({
 imports: [RouterLink, Spoken, PreferencesControls, ActionDockTemplate, ArasaacCredit],
 template: `<div class="page page--scroll stack">
  <h1><twc-spoken text="Настройки" recording="/kolibri/system-audio/settings-title.mp3" /></h1>
  <twc-preferences />
  <details>
    <summary>Об изображениях</summary>
    <p>Значок «Без звука» на экране проверки звука:
      <a href="https://arasaac.org/pictograms/en/38214" target="_blank" rel="noopener">ARASAAC №38214</a>.
    </p>
    <twc-arasaac-credit />
    <p>Пиктограмма телефона с увеличением громкости создана для «Колибри».</p>
  </details>
 </div>
 <ng-template twcActions><a class="btn btn--primary btn--block" [routerLink]="backUrl"><twc-spoken text="Готово" systemButton /></a></ng-template>`,
})
export class PreferencesPage {
  protected readonly back = publicReturn(inject(ActivatedRoute).snapshot.queryParamMap.get('return'));
  protected readonly backUrl = inject(Router).parseUrl(this.back);
  constructor() {
    const nav = inject(NavState);
    const router = inject(Router);
    const callback = () => { void router.navigateByUrl(this.back); };
    nav.backAction.set(callback);
    inject(DestroyRef).onDestroy(() => {
      if (nav.backAction() === callback) nav.backAction.set(null);
    });
  }
}
