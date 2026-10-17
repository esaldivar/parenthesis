import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'kid',
    loadComponent: () => import('./layout/kid-shell/kid-shell').then((m) => m.KidShell),
    loadChildren: () => import('./features/kid/kid.routes').then((m) => m.KID_ROUTES),
  },
  {
    path: '',
    loadComponent: () => import('./layout/parent-shell/parent-shell').then((m) => m.ParentShell),
    loadChildren: () => import('./features/parent.routes').then((m) => m.PARENT_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
