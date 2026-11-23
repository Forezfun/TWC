import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AdminUsers } from './users';

it('loads the archive on opening and moves restored staff back to the main list as active', async () => {
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AdminUsers);
  const http = TestBed.inject(HttpTestingController);
  const inactive = { id: 5, email: 'staff@example.test', name: 'Сотрудник', is_active: false };
  const inArchive = { ...inactive, is_archived: true };
  const restored = { ...inactive, is_active: true, is_archived: false };

  fixture.detectChanges();
  http.expectOne('/api/admin/users').flush([inactive]);
  http.expectNone('/api/admin/users?archived=true');
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();

  const root: HTMLElement = fixture.nativeElement;
  const panel = root.querySelector('details')!;
  const rows = root.querySelector('table tbody')!;
  expect(panel.open).toBe(false);

  rows.querySelector<HTMLButtonElement>('button[aria-label^="Архивировать"]')!.click();
  const archive = http.expectOne('/api/admin/users/5/archive?archived=true');
  expect(archive.request.method).toBe('PATCH');
  archive.flush(inArchive);
  TestBed.tick();
  http.expectOne('/api/admin/users').flush([]);
  expect(rows.textContent).not.toContain('Сотрудник');

  panel.open = true;
  panel.dispatchEvent(new Event('toggle'));
  TestBed.tick();
  http.expectOne('/api/admin/users?archived=true').flush([inArchive]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  panel.querySelector<HTMLButtonElement>('button[aria-label^="Вернуть из архива"]')!.click();
  const restore = http.expectOne('/api/admin/users/5/archive?archived=false');
  expect(restore.request.method).toBe('PATCH');
  restore.flush(restored);
  TestBed.tick();
  expect(rows.textContent).toContain('Сотрудник');
  expect(rows.textContent).toContain('Активен');
  expect(panel.textContent).not.toContain('Вернуть из архива');
  http.expectOne('/api/admin/users').flush([restored]);
  http.expectOne('/api/admin/users?archived=true').flush([]);
  http.verify();
});
