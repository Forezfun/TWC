import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from '../app';
import { Prefs } from '../core/prefs';
import { Welcome } from './welcome';

it('checks sound after the first screen, then teaches the card speaker before setup', async () => {
  TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([{ path: 'intro', component: Welcome }]), provideHttpClient()] });
  const prefs = TestBed.inject(Prefs);
  prefs.onboarded.set(false);
  prefs.sound.set(true);
  const fixture = TestBed.createComponent(App);
  const host: HTMLElement = fixture.nativeElement;
  const click = (label: string) => {
    [...host.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)!.click();
    fixture.detectChanges();
  };
  fixture.detectChanges();
  await TestBed.inject(Router).navigateByUrl('/intro');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  expect(host.querySelector('h1')?.textContent).toContain('Помощь шаг за шагом');
  click('Дальше');
  expect(host.querySelector('h1')?.textContent).toContain('Слышно?');
  expect(host.querySelectorAll('.sound-guide img')).toHaveLength(2);
  click('Да, слышно');
  expect(host.querySelector('h1')?.textContent).toContain('Послушайте одну карточку');
  click('Дальше');
  expect(host.querySelector('h1')?.textContent).toContain('Настройте «Колибри»');
});
