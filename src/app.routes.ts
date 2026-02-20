import { Routes } from '@angular/router';
import { ChatListComponent } from './features/chat-list/chat-list.component';

export const routes: Routes = [
  { path: '', component: ChatListComponent },
  { 
    path: 'chat/:id', 
    loadComponent: () => import('./features/chat-room/chat-room.component').then(m => m.ChatRoomComponent) 
  }
];