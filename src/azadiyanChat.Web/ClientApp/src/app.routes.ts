import { Routes } from '@angular/router';
import { ChatListComponent } from './features/chat-list/chat-list.component';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Auth routes (guests only)
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent),
    canActivate: [guestGuard]
  },
  // Protected routes
  {
    path: '',
    component: ChatListComponent,
    canActivate: [authGuard]
  },
  { 
    path: 'chat/:id', 
    loadComponent: () => import('./features/chat-room/chat-room.component').then(m => m.ChatRoomComponent),
    canActivate: [authGuard]
  },
  // Fallback
  { path: '**', redirectTo: '' }
];