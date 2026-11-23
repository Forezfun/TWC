import { HttpClient, httpResource } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { tap } from 'rxjs';
import defaults from '../../../../shared/site/display.json';
import { Api, audienceLabel } from './api';
import { Auth } from './auth';

export interface SiteRole {
  key: string;
  title: string;
  hint: string;
  audio_url: string | null;
  hint_audio_url?: string | null;
  icon_url?: string | null;
  is_hidden?: boolean;
}

export interface SupportButton {
  label: string;
  url: string | null;
  role_keys: string[];
}

export interface SiteDisplay {
  roles: SiteRole[];
  donate: SupportButton;
  volunteer: SupportButton;
  revision?: number;
}

export type SupportKind = 'donate' | 'volunteer';
export const DEFAULT_SITE_DISPLAY: SiteDisplay = defaults;
export const SUPPORT_KINDS: readonly SupportKind[] = ['donate', 'volunteer'];
const SITE_DISPLAY_CHANGED = 'twc-site-display-changed';

export function isRoleKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^(self|parents|specialists|role-[a-z0-9-]{1,42})$/.test(value);
}

export function supportButtons(display: SiteDisplay, roleKey: string): SupportButton[] {
  return SUPPORT_KINDS.map((kind) => display[kind]).filter((button) => button.role_keys.includes(roleKey));
}

@Injectable({ providedIn: 'root' })
export class SiteDisplayApi {
  private readonly http = inject(HttpClient);
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly adminRequested = signal(false);
  private readonly adminConfig = httpResource<SiteDisplay>(() =>
    this.adminRequested() && this.auth.loggedIn() ? this.api.url('/admin/site-display') : undefined);
  readonly resource = httpResource<SiteDisplay>(() => this.api.url('/site-display'));
  readonly display = computed(() => this.resource.hasValue() ? this.resource.value() : DEFAULT_SITE_DISPLAY);
  readonly roles = computed(() => this.resource.hasValue() ? this.resource.value().roles : []);

  constructor() {
    if (!this.browser) return;
    const refresh = (event: StorageEvent) => {
      if (event.key === SITE_DISPLAY_CHANGED) {
        this.resource.reload();
        if (this.adminRequested()) this.adminConfig.reload();
      }
    };
    window.addEventListener('storage', refresh);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', refresh));
  }

  adminResource() {
    this.adminRequested.set(true);
    return this.adminConfig;
  }

  label(key: string | null): string {
    const roles = this.adminConfig.hasValue() ? this.adminConfig.value().roles : this.roles();
    const title = roles.find((role) => role.key === key)?.title;
    const original = DEFAULT_SITE_DISPLAY.roles.find((role) => role.key === key)?.title;
    return title && title !== original ? title : audienceLabel(key) || title || '';
  }

  save(display: SiteDisplay) {
    return this.http.put<SiteDisplay>(this.api.url('/admin/site-display'), display).pipe(tap((saved) => {
      if (this.adminRequested()) this.adminConfig.value.set(saved);
      const roles = saved.roles.filter((role) => !role.is_hidden);
      const keys = new Set(roles.map(({ key }) => key));
      this.resource.value.set({
        ...saved,
        roles,
        donate: { ...saved.donate, role_keys: saved.donate.role_keys.filter((key) => keys.has(key)) },
        volunteer: { ...saved.volunteer, role_keys: saved.volunteer.role_keys.filter((key) => keys.has(key)) },
      });
      if (this.browser) {
        try {
          window.localStorage.setItem(SITE_DISPLAY_CHANGED, String(Date.now()));
        } catch {
          // The current tab already has the saved settings.
        }
      }
    }));
  }
}
