import { Component, inject, signal, computed, output, OnInit } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../core/services/chat.service';
import { AvatarComponent } from './avatar.component';
import { User } from '../../models/chat.model';

declare var gsap: any;

@Component({
  selector: 'app-create-group-modal',
  standalone: true,
  imports: [AvatarComponent],
  template: `
    <div
      id="creategroup-overlay-backdrop"
      class="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style="background: rgba(10, 14, 20, 0.42); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
      (click)="close()"
    >
      <div id="creategroup-overlay-card" class="w-full" style="max-width: 380px;" (click)="$event.stopPropagation()">
        <div id="creategroup-overlay-island" class="flex flex-col gap-3">

          <!-- Title island -->
          <div class="grp-field flex items-center justify-between bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
            <span class="text-sm font-semibold text-telegram-primary flex items-center gap-2">
              <i class="ph ph-users-three text-lg"></i>
              @if (step() === 'members') {
                Add Members
              } @else {
                Group Info
              }
            </span>
            <button class="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors active:scale-90" (click)="close()">
              <i class="ph ph-x text-lg"></i>
            </button>
          </div>

          @if (step() === 'members') {
            <!-- Selected chips -->
            @if (selectedUsers().length > 0) {
              <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2 flex flex-wrap gap-1.5" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                @for (user of selectedUsers(); track user.id) {
                  <span class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-telegram-primary/10 text-telegram-primary border border-telegram-primary/20">
                    {{ user.name.split(' ')[0] }}
                    <button class="hover:text-red-500 transition-colors" (click)="toggleUser(user)">
                      <i class="ph ph-x text-[10px]"></i>
                    </button>
                  </span>
                }
              </div>
            }

            <!-- Search island -->
            <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <div class="relative flex items-center">
                <i class="ph ph-magnifying-glass absolute left-2 text-gray-400 text-lg"></i>
                <input
                  type="text"
                  placeholder="Search users..."
                  class="w-full bg-transparent outline-none text-sm py-1.5 pl-8 pr-2"
                  style="border: none; box-shadow: none; color: var(--tg-text);"
                  [value]="searchQuery()"
                  (input)="onSearchInput($event)"
                >
                @if (isSearching()) {
                  <span class="w-4 h-4 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin absolute right-2"></span>
                }
              </div>
            </div>

            <!-- Results island -->
            @if (searchResults().length > 0) {
              <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md overflow-hidden" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); max-height: 240px; overflow-y: auto;">
                @for (user of searchResults(); track user.id) {
                  @let isSelected = isUserSelected(user.id);
                  <div
                    class="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all hover:bg-gray-100/80 dark:hover:bg-gray-700/40 active:scale-[0.98]"
                    [class.border-t]="!$first"
                    [class.border-gray-100]="!$first"
                    [class.dark:border-gray-700/30]="!$first"
                    [class.bg-telegram-primary\/10]="isSelected"
                    (click)="toggleUser(user)"
                  >
                    <app-avatar
                      [src]="user.avatarUrl"
                      [name]="user.name"
                      [isOnline]="user.isOnline || false"
                      size="sm"
                    ></app-avatar>
                    <div class="flex-1 min-w-0">
                      <div class="text-sm font-semibold truncate">{{ user.name }}</div>
                      @if (user.username) {
                        <div class="text-xs text-telegram-muted truncate">{{ '@' + user.username }}</div>
                      }
                    </div>
                    @if (isSelected) {
                      <i class="ph-fill ph-check-circle text-telegram-primary text-xl shrink-0"></i>
                    } @else {
                      <div class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600 shrink-0"></div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Empty/hint -->
            @if (searchQuery().length < 2 && searchResults().length === 0) {
              <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-5 text-center" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <i class="ph ph-at text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
                <p class="text-sm text-telegram-muted">Search for users to add</p>
                <p class="text-xs text-telegram-muted mt-1 opacity-60">Min 2 characters</p>
              </div>
            }
            @if (searchQuery().length >= 2 && !isSearching() && searchResults().length === 0) {
              <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-6 text-center" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <i class="ph ph-users text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
                <p class="text-sm text-telegram-muted">No users found</p>
              </div>
            }

            <!-- Next button -->
            <div class="grp-field">
              <button
                class="w-full py-2.5 rounded-2xl text-sm font-medium shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                [class]="selectedUsers().length > 0 ? 'bg-telegram-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'"
                [disabled]="selectedUsers().length === 0"
                (click)="goToInfo()"
              >
                Next ({{ selectedUsers().length }} selected)
              </button>
            </div>
          }

          @if (step() === 'info') {
            <!-- Group name island -->
            <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-telegram-primary/10 text-telegram-primary flex items-center justify-center shrink-0">
                  <i class="ph ph-users-three text-2xl"></i>
                </div>
                <div class="flex-1">
                  <label class="text-xs text-telegram-muted">Group name</label>
                  <input
                    type="text"
                    placeholder="Enter group name..."
                    class="w-full bg-transparent outline-none text-sm py-1"
                    style="border: none; box-shadow: none; color: var(--tg-text);"
                    [value]="groupName()"
                    (input)="onGroupNameInput($event)"
                    maxlength="50"
                  >
                </div>
              </div>
            </div>

            <!-- Members preview island -->
            <div class="grp-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <div class="text-xs text-telegram-muted mb-2">{{ selectedUsers().length }} members</div>
              <div class="flex flex-wrap gap-2">
                @for (user of selectedUsers(); track user.id) {
                  <div class="flex items-center gap-1.5">
                    <app-avatar [src]="user.avatarUrl" [name]="user.name" size="xs"></app-avatar>
                    <span class="text-xs font-medium">{{ user.name.split(' ')[0] }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Action buttons -->
            <div class="grp-field flex gap-2">
              <button
                class="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-gray-200 dark:border-gray-700/50 bg-white/90 dark:bg-telegram-surface shadow-md transition-all active:scale-[0.98] text-telegram-muted"
                (click)="step.set('members')"
              >
                Back
              </button>
              <button
                class="flex-1 py-2.5 rounded-2xl text-sm font-medium shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                [class]="groupName().trim() ? 'bg-telegram-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'"
                [disabled]="!groupName().trim() || isCreating()"
                (click)="createGroup()"
              >
                @if (isCreating()) {
                  <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span>
                }
                Create
              </button>
            </div>
          }

        </div>
      </div>
    </div>
  `
})
export class CreateGroupModalComponent {
  private api = inject(ApiService);
  private chatService = inject(ChatService);

  closed = output<void>();
  groupCreated = output<string>();

  step = signal<'members' | 'info'>('members');
  searchQuery = signal('');
  searchResults = signal<User[]>([]);
  isSearching = signal(false);
  selectedUsers = signal<User[]>([]);
  groupName = signal('');
  isCreating = signal(false);

  private searchDebounceTimer: any = null;

  isUserSelected(userId: string): boolean {
    return this.selectedUsers().some(u => u.id === userId);
  }

  onGroupNameInput(event: Event) {
    this.groupName.set((event.target as HTMLInputElement).value);
  }

  onSearchInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.searchQuery.set(query);

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (query.trim().length < 2) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    this.searchDebounceTimer = setTimeout(() => {
      this.api.searchUsers(query.trim()).subscribe({
        next: (users) => {
          this.searchResults.set(users);
          this.isSearching.set(false);
        },
        error: () => {
          this.searchResults.set([]);
          this.isSearching.set(false);
        }
      });
    }, 350);
  }

  toggleUser(user: User) {
    this.selectedUsers.update(users => {
      const exists = users.some(u => u.id === user.id);
      if (exists) return users.filter(u => u.id !== user.id);
      return [...users, user];
    });
  }

  goToInfo() {
    if (this.selectedUsers().length === 0) return;
    this.step.set('info');
  }

  async createGroup() {
    const name = this.groupName().trim();
    if (!name || this.selectedUsers().length === 0) return;

    this.isCreating.set(true);
    const participantIds = this.selectedUsers().map(u => u.id);
    const chatId = await this.chatService.createGroupChat(name, participantIds);
    this.isCreating.set(false);

    if (chatId) {
      this.groupCreated.emit(chatId);
    }
  }

  close() {
    if (this.isClosing) return;
    this.isClosing = true;

    const backdrop = document.getElementById('creategroup-overlay-backdrop');
    const card = document.getElementById('creategroup-overlay-card');

    if (typeof gsap === 'undefined' || !backdrop || !card) {
      this.closed.emit();
      this.isClosing = false;
      return;
    }

    const tl = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.closed.emit();
        this.isClosing = false;
      }
    });
    tl.to(card, { opacity: 0, y: 14, scale: 0.96, duration: 0.16, ease: 'power2.in' }, 0)
      .to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
  }

  private isClosing = false;

  animateIn() {
    const backdrop = document.getElementById('creategroup-overlay-backdrop');
    const card = document.getElementById('creategroup-overlay-card');
    const island = document.getElementById('creategroup-overlay-island');
    if (!backdrop || !card || typeof gsap === 'undefined') return;

    gsap.set(backdrop, { opacity: 0 });
    gsap.set(card, { opacity: 0, y: 24, scale: 0.94 });

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    tl.to(backdrop, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);
    tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.25)' }, 0.08);

    if (island) {
      const fields = island.querySelectorAll('.grp-field');
      if (fields.length > 0) {
        tl.fromTo(fields,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: 'power2.out' },
          0.18
        );
      }
    }
  }
}
