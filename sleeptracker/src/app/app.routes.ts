import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'tabs',
    loadComponent: () => import('./tabs/tabs.page').then(m => m.TabsPage),
    children: [
      {
        path: 'today',
        loadComponent: () => import('./pages/today/today.page').then(m => m.TodayPage),
      },
      {
        path: 'journal',
        loadComponent: () => import('./pages/journal/journal.page').then(m => m.JournalPage),
      },
      {
        path: 'trends',
        loadComponent: () => import('./pages/trends/trends.page').then(m => m.TrendsPage),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings.page').then(m => m.SettingsPage),
      },
      {
        path: '',
        redirectTo: '/tabs/today',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/today',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: '/tabs/today',
  },
];
