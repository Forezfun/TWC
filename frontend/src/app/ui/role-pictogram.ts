import { Component, input } from '@angular/core';
import { isAudience } from '../core/api';
import { Picto } from './picto';
import { PictogramThumbnail } from './pictogram-thumbnail';

@Component({
  selector: 'twc-role-pictogram',
  imports: [Picto, PictogramThumbnail],
  host: { 'aria-hidden': 'true' },
  template: `
    @if (url(); as image) {
      <twc-pictogram-thumbnail [url]="image" [size]="size()" />
    } @else {
      <twc-picto [key]="roleIcon(roleKey())" [size]="size()" />
    }
  `,
  styles: [`:host { display: grid; place-items: center; }`],
})
export class RolePictogram {
  readonly roleKey = input.required<string>();
  readonly url = input<string | null>();
  readonly size = input(28);
  protected readonly roleIcon = (key: string) => isAudience(key) ? key : 'self';
}
