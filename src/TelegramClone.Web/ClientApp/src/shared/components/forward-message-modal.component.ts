import { Component, inject, signal, computed, input, output, OnChanges, SimpleChanges, ElementRef, viewChild } from '@angular/core';
import { ChatService } from '../../core/services/chat.service';
import { AvatarComponent } from './avatar.component';
import { ShortTimePipe } from '../pipes/time.pipe';
import { Message, Chat } from '../../models/chat.model';

declare var gsap: any;

@Component({
  selector: 'app-forward-message-modal',
  standalone: true,
  imports: [AvatarComponent, ShortTimePipe],
  template: `
    @if (visible()) {
      <div
        id="forward-modal-backdrop"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4"
        style="background: rgba(10, 14, 20, 0.42); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
        (click)="close()"
      >
        <div id="forward-modal-card" class="w-full" style="max-width: 380px;" (click)="$event.stopPropagation()">
          <div id="forward-modal-island" class="flex flex-col gap-3">

            <!-- Title island -->
            <div class="fwd-field flex items-center justify-between bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <span class="text-sm font-semibold text-telegram-primary flex items-center gap-2">
                <i class="ph ph-share text-lg"></i>
                Forward message
              </span>
              <button class="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors active:scale-90" (click)="close()">
                <i class="ph ph-x text-lg"></i>
              </button>
            </div>

            <!-- Search island -->
            <div class="fwd-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <div class="relative flex items-center">
                <i class="ph ph-magnifying-glass absolute left-2 text-gray-400 text-lg"></i>
                <input
                  #searchInput
                  type="text"
                  placeholder="Search chats..."
                  class="w-full bg-transparent outline-none text-sm py-1.5 pl-8 pr-2"
                  style="border: none; box-shadow: none; color: var(--tg-text);"
                  [value]="searchQuery()"
                  (input)="onSearchInput($event)"
                >
              </div>
            </div>

            <!-- Chat list island -->
            <div class="fwd-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md overflow-hidden" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); max-height: 340px; overflow-y: auto;">
              @for (chat of filteredChats(); track chat.id) {
                <div
                  class="flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-all hover:bg-gray-100/80 dark:hover:bg-gray-700/40 active:scale-[0.98]"
                  [class.border-t]="!$first"
                  [class.border-gray-100]="!$first"
                  [class.dark:border-gray-700/30]="!$first"
                  [class.bg-telegram-primary\/10]="selectedChatId() === chat.id"
                  (click)="selectChat(chat)"
                >
                  @if (chat.type === 'saved') {
                    <div class="w-10 h-10 rounded-full bg-telegram-primary text-white flex items-center justify-center shrink-0">
                      <i class="ph-fill ph-bookmark-simple text-lg"></i>
                    </div>
                  } @else {
                    <app-avatar
                      [src]="chat.type === 'direct' ? getOtherParticipant(chat)?.avatarUrl : chat.avatarUrl"
                      [name]="getChatDisplayName(chat)"
                      [isOnline]="getOtherParticipant(chat)?.isOnline || false"
                      size="sm"
                    ></app-avatar>
                  }
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold truncate">{{ getChatDisplayName(chat) }}</div>
                    @if (chat.lastMessage?.text) {
                      <div class="text-xs text-telegram-muted truncate">{{ chat.lastMessage.text.substring(0, 40) }}</div>
                    }
                  </div>
                  @if (selectedChatId() === chat.id) {
                    <i class="ph-fill ph-check-circle text-telegram-primary text-xl shrink-0"></i>
                  }
                </div>
              }

              @if (filteredChats().length === 0) {
                <div class="px-4 py-6 text-center">
                  <i class="ph ph-chats-circle text-3xl text-gray-300 dark:text-gray-600 mb-2 block"></i>
                  <p class="text-sm text-telegram-muted">No chats found</p>
                </div>
              }
            </div>

            <!-- Message preview island -->
            @if (message()) {
              <div class="fwd-field bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <div class="text-xs text-telegram-muted mb-1">Forwarding:</div>
                <div class="text-sm truncate text-black dark:text-white">
                  {{ message()?.text?.substring(0, 80) || (message()?.voice ? '🎤 Voice message' : (message()?.attachments?.length ? '📎 Attachment' : 'Message')) }}
                </div>
              </div>
            }

            <!-- Action buttons island -->
            <div class="fwd-field flex gap-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
              <button
                class="flex-1 py-2.5 rounded-2xl text-sm font-medium border border-gray-200 dark:border-gray-700/50 bg-white/90 dark:bg-telegram-surface shadow-md transition-all active:scale-[0.98] text-telegram-muted"
                (click)="close()"
              >
                Cancel
              </button>
              <button
                class="flex-1 py-2.5 rounded-2xl text-sm font-medium shadow-md transition-all active:scale-[0.98] disabled:opacity-40"
                [class]="selectedChatId() ? 'bg-telegram-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'"
                [disabled]="!selectedChatId() || isSending()"
                (click)="confirmForward()"
              >
                @if (isSending()) {
                  <span class="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1"></span>
                }
                Send
              </button>
            </div>

          </div>
        </div>
      </div>
    }
  `
})
export class ForwardMessageModalComponent implements OnChanges {
  private chatService = inject(ChatService);

  message = input<Message | null>(null);
  visible = input<boolean>(false);
  closed = output<void>();
  chatSelected = output<string>();

  searchQuery = signal('');
  selectedChatId = signal<string | null>(null);
  isSending = signal(false);
  private isClosing = false;

  private allChats = computed(() => this.chatService.chats());

  filteredChats = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const chats = this.allChats();
    if (!query) return chats;
    return chats.filter(chat => {
      const name = this.getChatDisplayName(chat).toLowerCase();
      return name.includes(query);
    });
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['visible'] && this.visible()) {
      this.searchQuery.set('');
      this.selectedChatId.set(null);
      this.isSending.set(false);
      this.isClosing = false;
      setTimeout(() => this.animateIn(), 0);
    }
  }

  getChatDisplayName(chat: Chat): string {
    if (chat.type === 'saved') return 'Saved Messages';
    if (chat.type === 'direct') {
      const other = this.getOtherParticipant(chat);
      return other?.name || 'Chat';
    }
    return chat.name || 'Group';
  }

  getOtherParticipant(chat: Chat) {
    if (chat.type !== 'direct') return undefined;
    return chat.participants.find(p => p.id !== this.chatService.currentUser().id);
  }

  onSearchInput(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  selectChat(chat: Chat) {
    this.selectedChatId.set(this.selectedChatId() === chat.id ? null : chat.id);
  }

  confirmForward() {
    const chatId = this.selectedChatId();
    if (!chatId) return;
    this.isSending.set(true);
    this.chatSelected.emit(chatId);
  }

  close() {
    if (this.isClosing) return;
    this.isClosing = true;

    const backdrop = document.getElementById('forward-modal-backdrop');
    const card = document.getElementById('forward-modal-card');

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

  private animateIn() {
    const backdrop = document.getElementById('forward-modal-backdrop');
    const card = document.getElementById('forward-modal-card');
    const island = document.getElementById('forward-modal-island');
    if (!backdrop || !card || typeof gsap === 'undefined') return;

    gsap.set(backdrop, { opacity: 0 });
    gsap.set(card, { opacity: 0, y: 24, scale: 0.94 });

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    tl.to(backdrop, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);
    tl.to(card, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.25)' }, 0.08);

    if (island) {
      const fields = island.querySelectorAll('.fwd-field');
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
