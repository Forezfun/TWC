import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { App } from './app';
import { Prefs } from './core/prefs';
import { Speech } from './core/speech';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the supplied logo with an accessible name', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brand')?.getAttribute('aria-label')).toContain('Колибри');
    expect(fixture.nativeElement.querySelector('.brand__art')?.getAttribute('src')).toBe('/kolibri/logo.svg');
  });

  it('shows the stop and restart controls during page narration', () => {
    const fixture = TestBed.createComponent(App);
    TestBed.inject(Prefs).sound.set(true);
    fixture.detectChanges();
    const speech = TestBed.inject(Speech);
    speech.speaking.set('Страница');
    fixture.detectChanges();

    const controls = fixture.nativeElement.querySelectorAll('.page-audio button') as NodeListOf<HTMLButtonElement>;
    expect([...controls].map((control) => control.getAttribute('aria-label'))).toEqual(['Стоп', 'Заново']);
    expect([...controls].every((control) => !control.textContent?.trim())).toBe(true);
    expect(controls[0].querySelector('svg rect')).toBeTruthy();
    expect(controls[1].querySelector('svg path')).toBeTruthy();
  });
});
