import { Component } from '@angular/core';

@Component({
  selector: 'twc-arasaac-credit',
  template: `
    Пиктограммы <a href="https://arasaac.org/" target="_blank" rel="noopener">ARASAAC</a> ·
    Sergio Palao · Gobierno de Aragón ·
    <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>
  `,
  styles: `
    :host {
      display: block;
      color: var(--muted);
      font-size: .75rem;
      line-height: 1.4;
    }
  `,
})
export class ArasaacCredit {}
