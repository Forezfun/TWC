import { TestBed } from '@angular/core/testing';
import { Prefs } from './prefs';

describe('Prefs', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  it('defaults to medium text and sound on', () => {
    const prefs = TestBed.inject(Prefs);
    expect(prefs.textSize()).toBe('md');
    expect(prefs.sound()).toBe(true);
  });

  it('restores saved preferences', () => {
    localStorage.setItem('twc-prefs', JSON.stringify({ textSize: 'xl', sound: false }));
    const prefs = TestBed.inject(Prefs);
    expect(prefs.textSize()).toBe('xl');
    expect(prefs.sound()).toBe(false);
  });

  it('applies text size class to <html> and persists changes', async () => {
    const prefs = TestBed.inject(Prefs);
    prefs.textSize.set('lg');
    await TestBed.inject(AppRef).whenStable();
    expect(document.documentElement.classList.contains('text-lg')).toBe(true);
    expect(document.documentElement.classList.contains('text-xl')).toBe(false);
    expect(JSON.parse(localStorage.getItem('twc-prefs')!)).toEqual({ textSize: 'lg', sound: true });
  });
});

import { ApplicationRef as AppRef } from '@angular/core';
