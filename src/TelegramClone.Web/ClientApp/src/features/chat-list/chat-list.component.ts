import { Component, inject, signal, afterNextRender, ElementRef, viewChild, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ChatService } from '../../core/services/chat.service';
import { ApiService } from '../../core/services/api.service';
import { ThemeService } from '../../core/services/theme.service';
import { AnimationService } from '../../core/services/animation.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { SkeletonLoaderComponent } from '../../shared/components/skeleton-loader.component';
import { ShortTimePipe } from '../../shared/pipes/time.pipe';

declare var gsap: any;

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [AvatarComponent, SkeletonLoaderComponent, ShortTimePipe],
  template: `
    <div class="flex flex-col h-screen bg-gray-50 dark:bg-telegram-bg w-full" id="chat-list-container">
      
      <!-- Header — Glassmorphism -->
      <header class="safe-pt px-4 pb-3 flex items-center justify-between z-10 sticky top-0 glass-strong border-b border-white/10">
        <div class="flex items-center gap-3">
          <button
            #profileTrigger
            class="w-10 h-10 rounded-full border border-white/20 overflow-hidden shadow-md active:scale-90 transition-all"
            (click)="openProfileCard($event)"
            aria-label="Open profile"
          >
            @if (chatService.currentUser().avatarUrl) {
              <img [src]="chatService.currentUser().avatarUrl" class="w-full h-full" style="object-fit: cover;" alt="Profile">
            } @else {
              <div class="w-full h-full bg-telegram-primary text-white flex items-center justify-center font-semibold">
                {{ currentUserInitial() }}
              </div>
            }
          </button>
        </div>
        <div class="flex items-center gap-1">
          <button 
            (click)="cycleTheme($event)" 
            class="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center transition-all active:scale-90"
          >
            <i [class]="'ph ' + currentThemeIcon() + ' text-xl'"></i>
          </button>
        </div>
      </header>

      <!-- Search bar -->
      <div class="px-4 py-3 glass-strong">
        <div class="relative" #searchContainer>
          <i class="ph ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg transition-all" #searchIcon></i>
          <input 
            type="text" 
            placeholder="Search" 
            class="w-full bg-white/10 dark:bg-white/5 text-black dark:text-white rounded-xl py-2.5 pl-10 pr-4 outline-none transition-all placeholder-gray-500 text-15 border border-transparent focus:border-telegram-primary/30 focus:bg-white/15 dark:focus:bg-white/10"
            (focus)="onSearchFocus()"
            (blur)="onSearchBlur()"
            (input)="onSearchInput($event)"
          >
        </div>
      </div>

      <!-- Chat List -->
      <div #listContainer class="flex-1 overflow-y-auto no-scrollbar pb-24 custom-scrollbar">
        
        @if (isLoading()) {
          @for (i of skeletonItems; track i) {
            <app-skeleton-loader variant="chat-item"></app-skeleton-loader>
          }
        } @else {
          @if (pinnedChats().length > 0) {
            <div class="px-4 pt-2 pb-1">
              <span class="text-xs font-semibold text-telegram-primary uppercase tracking-wider">Pinned</span>
            </div>
          }

          @for (chat of filteredChats(); track chat.id) {
            @let participant = chatService.getParticipant(chat);
            @let typingUsers = chatService.getTypingUsersForChat(chat.id);
            
            @if (chat === firstUnpinnedChat() && pinnedChats().length > 0) {
              <div class="mx-4 my-1 h-px bg-gradient-to-r from-transparent via-gray-300/40 dark:via-gray-600/30 to-transparent"></div>
            }

            <div 
              class="chat-item flex items-center gap-3 px-4 py-3 cursor-pointer relative group transition-all duration-150 rounded-2xl border border-gray-200 dark:border-gray-700/50 bg-white/90 dark:bg-telegram-surface shadow-sm hover:shadow-xl hover:bg-white/10 active:bg-white/10"
              style="min-height: 72px; margin: 0 0.75rem 0.55rem; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);"
              [class.bg-telegram-primary-light]="chat.isPinned"
              (click)="openChat(chat.id, $event)"
            >
              <app-avatar 
                [src]="chat.type === 'direct' ? participant?.avatarUrl : chat.avatarUrl"
                [name]="chat.type === 'direct' ? (participant?.name || 'User') : (chat.name || 'Group')"
                [isOnline]="participant?.isOnline || false"
              ></app-avatar>
              
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center mb-0.5">
                  <div class="flex items-center gap-1.5 min-w-0">
                    @if (chat.type === 'channel') {
                      <i class="ph-fill ph-megaphone text-telegram-primary text-sm shrink-0"></i>
                    } @else if (chat.type === 'group') {
                      <i class="ph-fill ph-users-three text-telegram-primary text-sm shrink-0"></i>
                    }
                    <h3 class="font-semibold truncate text-15">
                      {{ chat.type === 'direct' ? participant?.name : chat.name }}
                    </h3>
                  </div>
                  <div class="flex items-center gap-1 shrink-0 text-xs text-gray-500 dark:text-telegram-muted tabular-nums">
                    @if (chat.lastMessage?.senderId === chatService.currentUser().id) {
                      <i class="ph-bold ph-checks text-telegram-primary text-xs"></i>
                    }
                    <span>{{ chat.lastMessage?.timestamp | shortTime }}</span>
                  </div>
                </div>
                
                <div class="flex justify-between items-center">
                  <p class="text-13 text-gray-500 dark:text-telegram-muted truncate flex-1 mr-3">
                    @if (typingUsers.length > 0) {
                      <span class="text-telegram-primary font-medium">typing
                        <span class="inline-flex gap-0.5 ml-0.5">
                          <span class="w-1 h-1 rounded-full bg-telegram-primary animate-typing-dot-1 inline-block"></span>
                          <span class="w-1 h-1 rounded-full bg-telegram-primary animate-typing-dot-2 inline-block"></span>
                          <span class="w-1 h-1 rounded-full bg-telegram-primary animate-typing-dot-3 inline-block"></span>
                        </span>
                      </span>
                    } @else {
                      @if (chat.lastMessage?.senderId === chatService.currentUser().id) {
                        <span class="text-black dark:text-white opacity-70 mr-0.5">You:</span>
                      } @else if (chat.type === 'group' || chat.type === 'channel') {
                        @let senderName = chatService.getUserById(chat.lastMessage?.senderId || '')?.name;
                        @if (senderName) {
                          <span class="text-telegram-primary font-medium mr-0.5">{{ senderName.split(' ')[0] }}:</span>
                        }
                      }
                      {{ chat.lastMessage?.voice ? '🎤 Voice Message' : (chat.lastMessage?.text || 'No messages yet') }}
                    }
                  </p>
                  
                  <div class="flex items-center gap-1.5 shrink-0">
                    @if (chat.isPinned) {
                      <i class="ph-fill ph-push-pin text-gray-400 dark:text-telegram-muted text-xs transform rotate-45"></i>
                    }
                    @if (chat.unreadCount > 0) {
                      <span class="bg-telegram-primary text-white text-2xs font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center animate-bounce-in">
                        {{ chat.unreadCount > 99 ? '99+' : chat.unreadCount }}
                      </span>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        }
      </div>

      @if (showProfileCard()) {
        <div
          id="profile-overlay-backdrop"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style="background: rgba(10, 14, 20, 0.42); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
          (click)="closeProfileCard()"
        >
          <div id="profile-overlay-card" class="w-full" style="max-width: 360px;" (click)="$event.stopPropagation()">
            <div
              id="profile-overlay-island"
              class="flex flex-col gap-3"
            >
              <div class="profile-field flex items-center justify-between bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-sm font-semibold text-telegram-primary">My Profile</span>
                <button class="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors active:scale-90" (click)="closeProfileCard()">
                  <i class="ph ph-x text-lg"></i>
                </button>
              </div>

              <div class="profile-field flex flex-col items-center gap-2 bg-white/90 dark:bg-telegram-surface rounded-3xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-3" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <button
                  type="button"
                  id="profile-island-avatar"
                  class="w-16 h-16 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 shadow-md active:scale-95 transition-transform"
                  (click)="triggerProfileAvatarPicker()"
                >
                  @if (profileDraft().avatarUrl) {
                    <img [src]="profileDraft().avatarUrl" class="w-full h-full" style="object-fit: cover;" alt="Avatar preview">
                  } @else {
                    <div class="w-full h-full bg-telegram-primary text-white flex items-center justify-center font-bold text-xl">
                      {{ profileDraftInitial() }}
                    </div>
                  }
                </button>
                <input
                  #profileAvatarInput
                  type="file"
                  accept="image/*"
                  class="hidden"
                  (change)="onProfileAvatarSelected($event)"
                >
                <button
                  type="button"
                  class="text-xs text-telegram-primary hover:opacity-70 transition-opacity"
                  (click)="triggerProfileAvatarPicker()"
                >
                  Change photo
                </button>
                <div class="min-w-0 text-center">
                  <div class="font-semibold truncate">{{ profileDraft().name || 'My Account' }}</div>
                  <div class="text-xs text-telegram-muted truncate">{{ '@' + (profileDraft().username || 'my_account') }}</div>
                </div>
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Display Name</span>
                <input
                  [value]="profileDraft().name"
                  (input)="onProfileInput('name', $event)"
                  class="w-full bg-transparent outline-none text-sm"
                  style="border: none; box-shadow: none;"
                  placeholder="Your name"
                >
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Username</span>
                <input
                  [value]="profileDraft().username"
                  (input)="onProfileInput('username', $event)"
                  class="w-full bg-transparent outline-none text-sm"
                  style="border: none; box-shadow: none;"
                  placeholder="username"
                >
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Bio</span>
                <textarea
                  [value]="profileDraft().bio"
                  (input)="onProfileInput('bio', $event)"
                  rows="3"
                  class="w-full bg-transparent outline-none resize-none text-sm no-scrollbar"
                  style="border: none; box-shadow: none;"
                  placeholder="Tell something about yourself"
                ></textarea>
              </div>

              @if (profileHasChanges()) {
                <div class="profile-save-island bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md p-2 animate-slide-up" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                  <button
                    class="w-full py-2 rounded-xl bg-telegram-primary text-white text-sm shadow-md hover:shadow-xl transition-all active:scale-95"
                    (click)="saveProfile()"
                  >
                    Save
                  </button>
                </div>
              }
            </div>
          </div>
        </div>
      }

      <!-- New Chat Modal (island-style) -->
      @if (showNewChatModal()) {
        <div
          id="newchat-overlay-backdrop"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style="background: rgba(10, 14, 20, 0.42); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
          (click)="closeNewChatModal()"
        >
          <div id="newchat-overlay-card" class="w-full" style="max-width: 380px;" (click)="$event.stopPropagation()">
            <div id="newchat-overlay-island" class="flex flex-col gap-3">

              <!-- Title island -->
              <div class="nc-field flex items-center justify-between bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-sm font-semibold text-telegram-primary flex items-center gap-2">
                  <i class="ph ph-chat-circle-dots text-lg"></i>
                  چت جدید
                </span>
                <button class="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors active:scale-90" (click)="closeNewChatModal()">
                  <i class="ph ph-x text-lg"></i>
                </button>
              </div>

              <!-- Search island -->
              <div class="nc-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <div class="relative flex items-center">
                  <i class="ph ph-magnifying-glass absolute left-2 text-gray-400 text-lg"></i>
                  <input
                    type="text"
                    placeholder="جستجوی نام کاربری..."
                    class="w-full bg-transparent outline-none text-sm py-1.5 pl-8 pr-2"
                    style="border: none; box-shadow: none; color: var(--tg-text);"
                    [value]="userSearchQuery()"
                    (input)="onUserSearchInput($event)"
                    #userSearchInput
                  >
                  @if (isSearchingUsers()) {
                    <span class="w-4 h-4 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin absolute right-2"></span>
                  }
                </div>
              </div>

              <!-- Results island -->
              @if (userSearchResults().length > 0) {
                <div class="nc-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md overflow-hidden" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); max-height: 280px; overflow-y: auto;">
                  @for (user of userSearchResults(); track user.id) {
                    <div
                      class="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all hover:bg-gray-100/80 dark:hover:bg-gray-700/40 active:scale-[0.98]"
                      [class.border-t]="!$first"
                      [class.border-gray-100]="!$first"
                      [class.dark:border-gray-700/30]="!$first"
                      (click)="selectUserForChat(user)"
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
                      <i class="ph ph-chat-circle text-telegram-primary text-xl shrink-0"></i>
                    </div>
                  }
                </div>
              }

              <!-- Empty state -->
              @if (userSearchQuery().length >= 2 && !isSearchingUsers() && userSearchResults().length === 0) {
                <div class="nc-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-6 text-center" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                  <i class="ph ph-users text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
                  <p class="text-sm text-telegram-muted">کاربری یافت نشد</p>
                </div>
              }

              <!-- Hint -->
              @if (userSearchQuery().length < 2 && userSearchResults().length === 0) {
                <div class="nc-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-5 text-center" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                  <i class="ph ph-at text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
                  <p class="text-sm text-telegram-muted">نام یا نام کاربری را وارد کنید</p>
                  <p class="text-xs text-telegram-muted mt-1 opacity-60">حداقل ۲ کاراکتر</p>
                </div>
              }

            </div>
          </div>
        </div>
      }

      <!-- FAB — opens new chat modal -->
      <div class="fixed bottom-6 right-6 z-20 flex flex-col-reverse items-center gap-3">
        <button 
          class="w-14 h-14 bg-telegram-primary text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-90 hover:shadow-xl hover:shadow-telegram-primary/30"
          (click)="openNewChatModal()"
        >
          <i class="ph ph-pencil-simple text-2xl"></i>
        </button>
      </div>
    </div>
  `
})
export class ChatListComponent {
  chatService = inject(ChatService);
  private api = inject(ApiService);
  themeService = inject(ThemeService);
  animation = inject(AnimationService);
  private router = inject(Router);
  
  listContainer = viewChild<ElementRef>('listContainer');
  profileTrigger = viewChild<ElementRef>('profileTrigger');
  profileAvatarInput = viewChild<ElementRef>('profileAvatarInput');
  
  isLoading = signal(true);
  showFabMenu = signal(false);
  showProfileCard = signal(false);
  showNewChatModal = signal(false);
  searchQuery = signal('');
  profileDraft = signal<ProfileDraft>({ name: '', username: '', bio: '', avatarUrl: '' });
  skeletonItems = [1, 2, 3, 4, 5, 6];
  private isClosingProfileCard = false;

  // New chat modal state
  userSearchQuery = signal('');
  userSearchResults = signal<any[]>([]);
  isSearchingUsers = signal(false);
  private searchDebounceTimer: any = null;
  private isClosingNewChatModal = false;

  nonArchivedChats = this.chatService.getNonArchivedChats();
  
  pinnedChats = computed(() => this.nonArchivedChats().filter(c => c.isPinned));
  
  firstUnpinnedChat = computed(() => {
    const chats = this.nonArchivedChats();
    return chats.find(c => !c.isPinned);
  });

  filteredChats = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const chats = this.nonArchivedChats();
    if (!q) return chats;
    return chats.filter(c => {
      const name = c.type === 'direct' 
        ? this.chatService.getParticipant(c)?.name 
        : c.name;
      return name?.toLowerCase().includes(q) || c.lastMessage?.text?.toLowerCase().includes(q);
    });
  });

  currentThemeIcon = computed(() => {
    const info = this.themeService.getThemeInfo(this.themeService.currentTheme());
    return info.icon;
  });

  currentUserInitial = computed(() => this.extractInitial(this.chatService.currentUser().name));
  profileDraftInitial = computed(() => this.extractInitial(this.profileDraft().name));
  profileHasChanges = computed(() => {
    const user = this.chatService.currentUser();
    const draft = this.profileDraft();
    return this.profileSnapshotFromUser(user) !== this.profileSnapshotFromDraft(draft);
  });

  constructor() {
    this.themeService.init();
    this.profileDraft.set(this.createDraftFromCurrentUser());
    
    afterNextRender(() => {
      setTimeout(() => {
        this.isLoading.set(false);
        setTimeout(() => {
          const container = this.listContainer()?.nativeElement;
          if (container) this.animation.staggerListItems(container);
        }, 50);
      }, 600);
    });
  }

  cycleTheme(event: MouseEvent) {
    this.themeService.toggleTheme(event);
  }

  onSearchFocus() {}
  onSearchBlur() {}

  onSearchInput(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openProfileCard(event: MouseEvent) {
    if (this.showProfileCard()) return;
    this.isClosingProfileCard = false;
    this.profileDraft.set(this.createDraftFromCurrentUser());
    this.showProfileCard.set(true);
    setTimeout(() => this.animateProfileCardIn(event.currentTarget as HTMLElement), 0);
  }

  closeProfileCard() {
    if (!this.showProfileCard() || this.isClosingProfileCard) return;
    this.isClosingProfileCard = true;

    const backdrop = document.getElementById('profile-overlay-backdrop');
    const card = document.getElementById('profile-overlay-card');
    const islandAvatar = document.getElementById('profile-island-avatar');
    const trigger = this.profileTrigger()?.nativeElement as HTMLElement | undefined;

    if (typeof gsap === 'undefined' || !backdrop || !card) {
      this.showProfileCard.set(false);
      this.isClosingProfileCard = false;
      return;
    }

    const tl = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.showProfileCard.set(false);
        this.isClosingProfileCard = false;
      }
    });

    if (islandAvatar && trigger) {
      const fromRect = islandAvatar.getBoundingClientRect();
      const toRect = trigger.getBoundingClientRect();
      const clone = islandAvatar.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      clone.style.position = 'fixed';
      clone.style.left = `${fromRect.left}px`;
      clone.style.top = `${fromRect.top}px`;
      clone.style.width = `${fromRect.width}px`;
      clone.style.height = `${fromRect.height}px`;
      clone.style.pointerEvents = 'none';
      clone.style.margin = '0';
      clone.style.zIndex = '102';
      clone.style.borderRadius = '9999px';
      clone.style.overflow = 'hidden';
      clone.style.willChange = 'left, top, width, height, opacity';
      document.body.appendChild(clone);

      tl.to(card, { opacity: 0, y: 14, scale: 0.96, duration: 0.16, ease: 'power2.in' }, 0)
        .to(clone, {
          left: toRect.left,
          top: toRect.top,
          width: toRect.width,
          height: toRect.height,
          opacity: 0,
          duration: 0.2,
          ease: 'power2.inOut',
          onComplete: () => clone.remove()
        }, 0.04)
        .to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
      return;
    }

    tl.to(card, { opacity: 0, y: 14, scale: 0.96, duration: 0.16, ease: 'power2.in' }, 0)
      .to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
  }

  onProfileInput(field: keyof ProfileDraft, event: Event) {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.profileDraft.update(draft => ({ ...draft, [field]: value }));
  }

  triggerProfileAvatarPicker() {
    const input = this.profileAvatarInput()?.nativeElement as HTMLInputElement | undefined;
    if (!input) return;
    input.click();
  }

  onProfileAvatarSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        this.profileDraft.update(draft => ({ ...draft, avatarUrl: result }));
      }
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  saveProfile() {
    const draft = this.profileDraft();
    this.chatService.updateCurrentUserProfile({
      name: draft.name.trim() || this.chatService.currentUser().name,
      username: this.normalizeUsername(draft.username),
      bio: draft.bio.trim(),
      avatarUrl: draft.avatarUrl?.trim() || this.chatService.currentUser().avatarUrl
    });
    this.closeProfileCard();
  }

  openChat(chatId: string, event: MouseEvent) {
    this.animation.rippleEffect(event, event.currentTarget as HTMLElement);
    setTimeout(() => {
      this.router.navigate(['/chat', chatId]);
    }, 150);
  }

  toggleFab() {
    this.openNewChatModal();
  }

  // ═══════════════════════════════════════════
  //  New Chat Modal
  // ═══════════════════════════════════════════

  openNewChatModal() {
    if (this.showNewChatModal()) return;
    this.isClosingNewChatModal = false;
    this.userSearchQuery.set('');
    this.userSearchResults.set([]);
    this.isSearchingUsers.set(false);
    this.showNewChatModal.set(true);
    setTimeout(() => this.animateNewChatModalIn(), 0);
  }

  closeNewChatModal() {
    if (!this.showNewChatModal() || this.isClosingNewChatModal) return;
    this.isClosingNewChatModal = true;

    const backdrop = document.getElementById('newchat-overlay-backdrop');
    const card = document.getElementById('newchat-overlay-card');

    if (typeof gsap === 'undefined' || !backdrop || !card) {
      this.showNewChatModal.set(false);
      this.isClosingNewChatModal = false;
      return;
    }

    const tl = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.showNewChatModal.set(false);
        this.isClosingNewChatModal = false;
      }
    });
    tl.to(card, { opacity: 0, y: 14, scale: 0.96, duration: 0.16, ease: 'power2.in' }, 0)
      .to(backdrop, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0);
  }

  onUserSearchInput(event: Event) {
    const query = (event.target as HTMLInputElement).value;
    this.userSearchQuery.set(query);

    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);

    if (query.trim().length < 2) {
      this.userSearchResults.set([]);
      this.isSearchingUsers.set(false);
      return;
    }

    this.isSearchingUsers.set(true);
    this.searchDebounceTimer = setTimeout(() => {
      this.api.searchUsers(query.trim()).subscribe({
        next: (users) => {
          this.userSearchResults.set(users);
          this.isSearchingUsers.set(false);
        },
        error: () => {
          this.userSearchResults.set([]);
          this.isSearchingUsers.set(false);
        }
      });
    }, 350);
  }

  async selectUserForChat(user: any) {
    this.isSearchingUsers.set(true);
    const chatId = await this.chatService.startDirectChat(user.id);
    this.isSearchingUsers.set(false);

    if (chatId) {
      this.showNewChatModal.set(false);
      this.isClosingNewChatModal = false;
      this.router.navigate(['/chat', chatId]);
    }
  }

  private animateNewChatModalIn() {
    const backdrop = document.getElementById('newchat-overlay-backdrop');
    const card = document.getElementById('newchat-overlay-card');
    const island = document.getElementById('newchat-overlay-island');
    if (!backdrop || !card || typeof gsap === 'undefined') return;

    gsap.set(backdrop, { opacity: 0 });
    gsap.set(card, { opacity: 0, y: 24, scale: 0.94 });

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    tl.to(backdrop, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);
    tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.25)' }, 0.08);

    if (island) {
      const fields = island.querySelectorAll('.nc-field');
      if (fields.length > 0) {
        tl.fromTo(fields,
          { opacity: 0, y: 12 },
          { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: 'power2.out' },
          0.18
        );
      }
    }
  }

  private createDraftFromCurrentUser(): ProfileDraft {
    const user = this.chatService.currentUser();
    return {
      name: user.name || '',
      username: user.username || this.normalizeUsername(user.name || 'my_account'),
      bio: user.bio || '',
      avatarUrl: user.avatarUrl || ''
    };
  }

  private normalizeUsername(raw: string): string {
    const normalized = raw.replace(/^@+/, '').replace(/\s+/g, '_').toLowerCase();
    return normalized || 'my_account';
  }

  private profileSnapshotFromUser(user: { name?: string; username?: string; bio?: string; avatarUrl?: string }): string {
    return JSON.stringify({
      name: (user.name || '').trim(),
      username: this.normalizeUsername(user.username || user.name || ''),
      bio: (user.bio || '').trim(),
      avatarUrl: (user.avatarUrl || '').trim()
    });
  }

  private profileSnapshotFromDraft(draft: ProfileDraft): string {
    return JSON.stringify({
      name: (draft.name || '').trim(),
      username: this.normalizeUsername(draft.username || draft.name || ''),
      bio: (draft.bio || '').trim(),
      avatarUrl: (draft.avatarUrl || '').trim()
    });
  }

  private extractInitial(name: string): string {
    return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }

  private animateProfileCardIn(sourceEl?: HTMLElement) {
    const backdrop = document.getElementById('profile-overlay-backdrop');
    const card = document.getElementById('profile-overlay-card');
    const island = document.getElementById('profile-overlay-island');
    const islandAvatar = document.getElementById('profile-island-avatar');
    if (!backdrop || !card || !island || typeof gsap === 'undefined') return;

    gsap.set(backdrop, { opacity: 0 });
    gsap.set(card, { opacity: 0, y: 24, scale: 0.94 });

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    tl.to(backdrop, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);

    if (sourceEl && islandAvatar) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = islandAvatar.getBoundingClientRect();
      const clone = sourceEl.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      clone.style.position = 'fixed';
      clone.style.left = `${sourceRect.left}px`;
      clone.style.top = `${sourceRect.top}px`;
      clone.style.width = `${sourceRect.width}px`;
      clone.style.height = `${sourceRect.height}px`;
      clone.style.pointerEvents = 'none';
      clone.style.margin = '0';
      clone.style.zIndex = '102';
      clone.style.borderRadius = '9999px';
      clone.style.overflow = 'hidden';
      clone.style.willChange = 'left, top, width, height, opacity';
      document.body.appendChild(clone);

      tl.to(clone, {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        opacity: 0,
        duration: 0.26,
        ease: 'power3.out',
        onComplete: () => clone.remove()
      }, 0.04);
    }

    tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.25)' }, 0.16);
    const fields = island.querySelectorAll('.profile-field');
    if (fields.length > 0) {
      tl.fromTo(fields,
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.22, stagger: 0.04, ease: 'power2.out' },
        0.24
      );
    }
  }
}

interface ProfileDraft {
  name: string;
  username: string;
  bio: string;
  avatarUrl: string;
}
