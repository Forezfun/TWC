import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App } from '../../app';
import { Prefs } from '../../core/prefs';
import { DEFAULT_SITE_DISPLAY } from '../../core/site-display';
import { InstructionPlayer } from './instruction-player';

it('ставит кнопки выбранной роли над озвучкой и оставляет их при отключении звука', async () => {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      provideHttpClient(), provideHttpClientTesting(),
      provideRouter([{ path: 'instructions/:id', component: InstructionPlayer }]),
    ],
  });
  const fixture = TestBed.createComponent(App);
  const http = TestBed.inject(HttpTestingController);
  const prefs = TestBed.inject(Prefs);
  prefs.sound.set(true);
  fixture.detectChanges();
  const router = TestBed.inject(Router);

  async function open(id: number, audience: string) {
    await router.navigateByUrl('/instructions/' + id);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne('/api/instructions/' + id).flush({
      id, audience, title: 'Новая инструкция', title_audio_url: '/scenario-title.mp3', start_step_id: 'a',
      steps: [{ id: 'a', title: 'Первый шаг', body: '', next_id: null, choices: [] }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
  }

  await open(1, 'role-family');
  const display = structuredClone(DEFAULT_SITE_DISPLAY);
  display.roles.push({ key: 'role-family', title: 'Семья', hint: '', audio_url: null });
  display.donate.role_keys.push('role-family');
  display.volunteer.role_keys.push('role-family');
  http.expectOne('/api/site-display').flush(display);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();

  const root: HTMLElement = fixture.nativeElement;
  const support = root.querySelector('.scenario-support');
  expect(support?.querySelector('a')?.getAttribute('href')).toBe('https://anokolibri.ru/donate');
  expect(support?.querySelector('button')?.disabled).toBe(true);
  expect(support?.nextElementSibling?.className).toBe('page-audio');
  prefs.sound.set(false);
  fixture.detectChanges();
  expect(root.querySelector('.scenario-support')).toBeTruthy();
  expect(root.querySelector('.page-audio')).toBeNull();

  await open(2, 'self');
  expect(root.querySelector('.scenario-support')).toBeNull();
  expect(root.querySelector('.step-count')?.textContent).toMatch(/^\d+%$/);
  expect(root.querySelector('[role="progressbar"]')?.hasAttribute('aria-valuenow')).toBe(true);
  expect(root.querySelector('.step-count [data-read]')).toBeNull();
  expect(root.querySelector('.instruction-page h1')?.textContent?.trim()).toBe('Новая инструкция');
  expect(root.querySelector('.instruction-page h1 [data-read]')).toBeNull();
  expect(root.querySelector('.instruction-page h2 [data-read]')?.getAttribute('data-read')).toBe('Первый шаг');
  await router.navigateByUrl('/instructions/2?done=1');
  fixture.detectChanges();
  expect(root.querySelector('.instruction-page h1 [data-read]')?.getAttribute('data-read')).toBe('Инструкция завершена');
  http.verify();
});
