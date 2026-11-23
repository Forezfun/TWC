import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { adminGuard } from './core/auth';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/welcome').then((m) => m.Welcome),
    title: 'Знакомство — «Колибри»',
  },
  { path: 'intro', loadComponent: () => import('./pages/welcome').then((m) => m.Welcome) },
  { path: 'sections', loadComponent: () => import('./pages/home').then((m) => m.Home) },
  { path: 'preferences', loadComponent: () => import('./pages/preferences').then((m) => m.PreferencesPage) },
  { path: 'instructions', loadComponent: () => import('./pages/instructions/instruction-list').then((m) => m.InstructionList) },
  { path: 'instructions/:id', loadComponent: () => import('./pages/instructions/instruction-player').then((m) => m.InstructionPlayer) },
  {
    path: 'help',
    loadComponent: () => import('./pages/help').then((m) => m.Help),
    title: 'Помощь — «Колибри»',
  },
  {
    path: 'consult',
    pathMatch: 'full',
    redirectTo: ({ queryParams }) => inject(Router).createUrlTree(['/help'], { queryParams }),
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/admin/login').then((m) => m.AdminLogin),
    title: 'Вход — админ-панель «Колибри»',
  },
  {
    path: 'admin/preview',
    canActivate: [adminGuard],
    data: { preview: true },
    loadComponent: () => import('./pages/instructions/instruction-player').then((m) => m.InstructionPlayer),
    title: 'Предпросмотр сценария — «Колибри»',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/layout').then((m) => m.AdminLayout),
    title: 'Админ-панель «Колибри»',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'requests' },
      {
        path: 'requests',
        loadComponent: () => import('./pages/admin/requests').then((m) => m.AdminRequests),
      },
      { path: 'slots', pathMatch: 'full', redirectTo: 'requests' },
      {
        path: 'scenarios',
        loadComponent: () => import('./pages/admin/instructions').then((m) => m.AdminInstructions),
      },
      {
        path: 'pictograms',
        loadComponent: () => import('./pages/admin/pictograms').then((m) => m.AdminPictograms),
      },
      {
        path: 'topics',
        pathMatch: 'full',
        redirectTo: 'scenarios',
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/admin/settings').then((m) => m.AdminSettings),
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/admin/users').then((m) => m.AdminUsers),
      },
    ],
  },
  {
    path: ':audience',
    loadComponent: () => import('./pages/instructions/instruction-list').then((m) => m.InstructionList),
    title: 'Темы — «Колибри»',
  },
  {
    path: ':audience/:topicId',
    loadComponent: () => import('./pages/instructions/instruction-list').then((m) => m.InstructionList),
    title: '«Колибри»',
  },
  { path: '**', redirectTo: '' },
];
