import { Routes } from '@angular/router';
import { adminGuard } from './core/auth';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home').then((m) => m.Home),
    title: 'Навигатор «Колибри»',
  },
  {
    path: 'help',
    loadComponent: () => import('./pages/help').then((m) => m.Help),
    title: 'Помощь — «Колибри»',
  },
  {
    path: 'consult',
    loadComponent: () => import('./pages/consult').then((m) => m.Consult),
    title: 'Запись на консультацию — «Колибри»',
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./pages/admin/login').then((m) => m.AdminLogin),
    title: 'Вход — админка «Колибри»',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./pages/admin/layout').then((m) => m.AdminLayout),
    title: 'Админка «Колибри»',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'requests' },
      {
        path: 'requests',
        loadComponent: () => import('./pages/admin/requests').then((m) => m.AdminRequests),
      },
      {
        path: 'slots',
        loadComponent: () => import('./pages/admin/slots').then((m) => m.AdminSlots),
      },
      {
        path: 'scenarios',
        loadComponent: () => import('./pages/admin/scenarios').then((m) => m.AdminScenarios),
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
    loadComponent: () => import('./pages/topics').then((m) => m.Topics),
    title: 'Темы — «Колибри»',
  },
  {
    path: ':audience/:id',
    loadComponent: () => import('./pages/node').then((m) => m.NodePage),
    title: '«Колибри»',
  },
  { path: '**', redirectTo: '' },
];
