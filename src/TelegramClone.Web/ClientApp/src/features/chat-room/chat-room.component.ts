import { Component, inject, computed, effect, ElementRef, viewChild, afterNextRender, signal, OnDestroy } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../core/services/chat.service';
import { ApiService } from '../../core/services/api.service';
import { VoiceRecorderService } from '../../core/services/voice-recorder.service';
import { AnimationService } from '../../core/services/animation.service';
import { AudioService } from '../../core/services/audio.service';
import { ThemeService } from '../../core/services/theme.service';
import { AvatarComponent } from '../../shared/components/avatar.component';
import { VoicePlayerComponent } from '../../shared/components/voice-player.component';
import { EmojiPickerComponent } from '../../shared/components/emoji-picker.component';
import { TypingIndicatorComponent } from '../../shared/components/typing-indicator.component';
import { DateSeparatorComponent } from '../../shared/components/date-separator.component';
import { ShortTimePipe } from '../../shared/pipes/time.pipe';
import { Message, Attachment } from '../../models/chat.model';
import { firstValueFrom } from 'rxjs';

declare var gsap: any;
const CONTEXT_REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [AvatarComponent, VoicePlayerComponent, EmojiPickerComponent, TypingIndicatorComponent, DateSeparatorComponent, ShortTimePipe, FormsModule],
  template: `
    <div
      class="flex flex-col h-screen w-full overflow-hidden relative"
      id="chat-room-container"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave($event)"
      (drop)="onDropFiles($event)"
    >
      
      <!-- Ambient gradient overlay — outside scroll container to prevent repaint -->
      <div class="fixed inset-0 pointer-events-none z-0" 
           style="background: linear-gradient(180deg, var(--tg-gradient-start) 0%, transparent 30%, transparent 70%, var(--tg-gradient-end) 100%); opacity: 0.15;"></div>

      @if (isDraggingFiles()) {
        <div class="absolute inset-0 z-40 flex items-center justify-center p-4 bg-black/40" style="backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);">
          <div class="bg-white dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 text-center shadow-xl">
            <i class="ph-fill ph-upload-simple text-2xl text-telegram-primary block mb-2"></i>
            <div class="text-sm font-semibold">Drop files to attach</div>
            <div class="text-xs text-telegram-muted mt-1">Image, video, audio, or document</div>
          </div>
        </div>
      }

      <!-- Sticky Header — Glassmorphism -->
      <header class="safe-pt px-2 pb-2 flex items-center z-20 sticky top-0 glass-strong border-b border-white/10 relative">
        <button (click)="goBack()" class="p-2 mr-1 rounded-full text-telegram-primary hover:bg-white/10 transition-all active:scale-90 z-10">
          <i class="ph ph-caret-left text-2xl"></i>
        </button>
        
        <div
          #peerProfileTrigger
          class="flex flex-1 items-center gap-3 cursor-pointer z-10"
          (click)="chat()?.type !== 'saved' ? openPeerProfile($event) : null"
        >
          @if (chat()?.type === 'saved') {
            <div class="w-9 h-9 rounded-full bg-telegram-primary text-white flex items-center justify-center shrink-0">
              <i class="ph-fill ph-bookmark-simple text-lg"></i>
            </div>
          } @else {
            <app-avatar 
              [src]="chat()?.type === 'direct' ? participant()?.avatarUrl : chat()?.avatarUrl"
              [name]="chat()?.type === 'direct' ? (participant()?.name || '') : (chat()?.name || '')"
              [isOnline]="participant()?.isOnline || false"
              size="sm"
            ></app-avatar>
          }
          <div class="flex flex-col">
            <h2 class="font-semibold text-base leading-tight">
              {{ chat()?.type === 'saved' ? 'Saved Messages' : (chat()?.type === 'direct' ? participant()?.name : chat()?.name) }}
            </h2>
            @if (chat()?.type !== 'saved') {
              <span class="text-xs text-telegram-primary" #statusText>
                {{ statusString() }}
              </span>
            }
          </div>
        </div>
        
        <div class="flex items-center gap-1 text-telegram-primary z-10">
          <button (click)="themeService.toggleTheme($event)" class="p-2 rounded-full hover:bg-white/10 active:scale-90 transition-all">
            <i [class]="'ph ' + themeService.getThemeInfo(themeService.currentTheme()).icon + ' text-xl'"></i>
          </button>
        </div>
      </header>

      <!-- Message Area — SVG Pattern Background -->
      <div 
        #messagesContainer 
        class="flex-1 overflow-y-auto px-4 pt-4 flex flex-col gap-1 relative telegram-pattern custom-scrollbar"
        [style.paddingBottom]="replyingTo() ? '9.25rem' : '6rem'"
      >
        @for (item of displayItems(); track item.key) {
          @if (item.type === 'date') {
            <app-date-separator [label]="item.dateLabel!"></app-date-separator>
          } @else if (item.type === 'message') {
            @let msg = item.message!;
            @let isMine = chat()?.type === 'saved' ? true : msg.senderId === chatService.currentUser().id;
            @let isSaved = chat()?.type === 'saved';
            @let showTail = item.showTail;
            @let isGrouped = item.isGrouped;
            
            <div 
              class="message-bubble flex flex-col relative z-10"
              [class.self-end]="isMine"
              [class.self-start]="!isMine"
              [class.max-w-\[80\%\]]="true"
              [class.mt-0\.5]="isGrouped"
              [class.mt-2]="!isGrouped"
              (touchstart)="onTouchStart($event, msg)"
              (touchmove)="onTouchMove($event, msg)"
              (touchend)="onTouchEnd($event, msg)"
              (contextmenu)="onContextMenu($event, msg)"
              [style.transform]="swipingMsgId() === msg.id ? 'translateX(' + swipeX() + 'px)' : 'translateX(0px)'"
              [id]="'msg-' + msg.id"
              [style.opacity]="msg.isAnimating ? '0' : '1'"
            >
              <!-- Reply Reference -->
              @if (msg.replyToId) {
                @let replyMsg = chatService.getMessageById(msg.replyToId);
                @if (replyMsg) {
                  <div 
                    class="flex items-center gap-2 px-3 py-1.5 mb-0.5 rounded-xl text-xs cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                    [class]="isMine ? 'bg-white/10' : 'bg-telegram-primary/10'"
                    (click)="scrollToMessage(msg.replyToId!)"
                  >
                    <div class="w-0.5 h-6 rounded-full" [class]="isMine ? 'bg-white/50' : 'bg-telegram-primary'"></div>
                    <div class="min-w-0">
                      <div class="font-semibold truncate" [class]="isMine ? 'text-white/80' : 'text-telegram-primary'">
                        {{ chatService.getUserById(replyMsg.senderId)?.name || 'User' }}
                      </div>
                      <div class="truncate text-gray-400">{{ replyMsg.text?.substring(0, 50) }}</div>
                    </div>
                  </div>
                }
              }

              <!-- Bubble Content -->
              <div 
                class="px-3 py-1.5 shadow-sm text-[15px] relative group transition-all"
                [class]="isMine 
                  ? 'bg-telegram-primary text-white ' + (showTail ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl')
                  : 'bg-white dark:bg-telegram-surface text-black dark:text-white ' + (showTail ? 'rounded-2xl rounded-bl-sm' : 'rounded-2xl') + ' border border-gray-100 dark:border-gray-800/50'"
              >
                <!-- Sender name for groups -->
                @if (!isMine && !isSaved && (chat()?.type === 'group' || chat()?.type === 'channel') && !isGrouped) {
                  <div class="text-xs font-semibold text-telegram-primary mb-0.5">
                    {{ chatService.getUserById(msg.senderId)?.name }}
                  </div>
                }

                <!-- Voice Note -->
                @if (msg.voice) {
                  <app-voice-player 
                    [audioUrl]="msg.voice.url" 
                    [durationMs]="msg.voice.durationMs"
                    [waveform]="msg.voice.waveform"
                    [isMine]="isMine"
                  ></app-voice-player>
                }

                <!-- File Attachments -->
                @if (msg.attachments && msg.attachments.length > 0) {
                  <div class="flex flex-col gap-2 mb-1">
                    @for (att of msg.attachments; track att.id) {
                      @if (att.type === 'image') {
                        <div class="rounded-xl overflow-hidden border" [class]="isMine ? 'border-white/10' : 'border-gray-200 dark:border-gray-700'">
                          <img
                            [src]="att.url"
                            [alt]="att.name || 'Image'"
                            class="w-full cursor-pointer"
                            style="max-height: 260px; object-fit: cover;"
                            (click)="openAttachment(att, $event)"
                          >
                        </div>
                      } @else if (att.type === 'video') {
                        <div class="rounded-xl overflow-hidden border" [class]="isMine ? 'border-white/10' : 'border-gray-200 dark:border-gray-700'">
                          <video
                            class="w-full"
                            style="max-height: 240px; background: rgba(0,0,0,0.2);"
                            controls
                            playsinline
                            preload="metadata"
                          >
                            <source [src]="att.url">
                          </video>
                          <button class="w-full flex items-center gap-2 px-2 py-2 text-left" (click)="openAttachment(att, $event)">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-telegram-primary/10 text-telegram-primary shrink-0">
                              <i class="ph-fill ph-video-camera text-base"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                              <div class="text-sm truncate">{{ attachmentDisplayName(att) }}</div>
                              <div class="text-xs" [class]="isMine ? 'text-white/70' : 'text-telegram-muted'">{{ attachmentMeta(att) }}</div>
                            </div>
                            <i class="ph ph-arrow-up-right text-sm"></i>
                          </button>
                        </div>
                      } @else if (att.type === 'audio') {
                        <div class="rounded-xl border px-2 py-2" [class]="isMine ? 'border-white/10 bg-white/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'">
                          <div class="flex items-center gap-2 mb-1">
                            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-telegram-primary/10 text-telegram-primary shrink-0">
                              <i class="ph-fill ph-music-notes text-base"></i>
                            </div>
                            <div class="min-w-0">
                              <div class="text-sm truncate">{{ attachmentDisplayName(att) }}</div>
                              <div class="text-xs" [class]="isMine ? 'text-white/70' : 'text-telegram-muted'">{{ attachmentMeta(att) }}</div>
                            </div>
                          </div>
                          <audio class="w-full" controls [src]="att.url"></audio>
                        </div>
                      } @else {
                        <button
                          class="w-full flex items-center gap-2 px-2 py-2 rounded-xl border text-left transition-all active:scale-95"
                          [class]="isMine ? 'border-white/10 bg-white/10' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800'"
                          (click)="openAttachment(att, $event)"
                        >
                          <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-telegram-primary/10 text-telegram-primary shrink-0">
                            <i [class]="attachmentIcon(att) + ' text-base'"></i>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">{{ attachmentDisplayName(att) }}</div>
                            <div class="text-xs" [class]="isMine ? 'text-white/70' : 'text-telegram-muted'">{{ attachmentMeta(att) }}</div>
                          </div>
                          <i class="ph ph-download-simple text-lg"></i>
                        </button>
                      }
                    }
                  </div>
                }

                <!-- Text -->
                @if (msg.text) {
                  <p class="leading-relaxed whitespace-pre-wrap break-words" [id]="'text-' + msg.id">{{ msg.text }}</p>
                }

                <!-- Meta Data — flex row, no float for better layout -->
                <div 
                  class="flex items-center gap-1 text-[10px] mt-0.5 justify-end ml-3"
                  [class]="isMine ? 'text-white/60' : 'text-telegram-muted'"
                >
                  <span class="tabular-nums">{{ msg.timestamp | shortTime }}</span>
                  @if (isMine && !isSaved) {
                    @if (msg.status === 'sending') {
                      <i class="ph ph-clock text-xs opacity-60"></i>
                    } @else if (msg.status === 'sent') {
                      <i class="ph ph-check text-xs"></i>
                    } @else if (msg.status === 'delivered') {
                      <i class="ph-bold ph-checks text-xs"></i>
                    } @else if (msg.status === 'seen') {
                      <i class="ph-bold ph-checks text-xs text-green-400"></i>
                    }
                  }
                </div>
              </div>

              <!-- Reactions -->
              @if (msg.reactions && msg.reactions.length > 0) {
                <div class="flex flex-wrap gap-1 mt-1" [class.self-end]="isMine" [class.self-start]="!isMine">
                  @for (reaction of msg.reactions; track reaction.emoji) {
                    <button 
                      class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all hover:scale-105 active:scale-95"
                      [class]="reaction.userIds.includes(chatService.currentUser().id) 
                        ? 'bg-telegram-primary/20 border-telegram-primary/40 text-telegram-primary' 
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'"
                      (click)="toggleReaction(msg.id, reaction.emoji, $event)"
                    >
                      <span>{{ reaction.emoji }}</span>
                      <span class="font-medium">{{ reaction.userIds.length }}</span>
                    </button>
                  }
                </div>
              }
            </div>
          }
        }

        <!-- Typing Indicator -->
        @if (isTyping() && chat()?.type !== 'saved') {
          <app-typing-indicator></app-typing-indicator>
        }
      </div>

      <!-- Scroll to bottom button -->
      @if (showScrollBtn()) {
        <button 
          class="absolute bottom-[80px] right-4 z-30 w-10 h-10 rounded-full bg-white dark:bg-telegram-surface shadow-lg flex items-center justify-center text-telegram-primary hover:scale-110 active:scale-90 transition-all border border-gray-200 dark:border-gray-700"
          (click)="scrollToBottom()"
          id="scroll-bottom-btn"
        >
          <i class="ph-bold ph-caret-down text-lg"></i>
        </button>
      }

      <!-- Message Actions Preview -->
      @if (contextMenuMsg()) {
        @let activeMsg = contextMenuMsg()!;
        @let previewIsMine = chat()?.type === 'saved' ? true : activeMsg.senderId === chatService.currentUser().id;
        <div
          id="context-preview-backdrop"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style="background: rgba(10, 14, 20, 0.38); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
          (click)="closeContextPreview()"
        >
          <div id="context-preview-card" class="w-full max-w-[340px] flex flex-col gap-2" (click)="$event.stopPropagation()">
            <div id="context-preview-message" class="w-full">
              <div
                id="context-preview-bubble"
                class="px-3 py-2 shadow-xl text-[15px] transition-all"
                [class]="previewIsMine
                  ? 'bg-telegram-primary text-white rounded-2xl rounded-br-sm'
                  : 'bg-white dark:bg-telegram-surface text-black dark:text-white rounded-2xl rounded-bl-sm border border-gray-100 dark:border-gray-800/50'"
              >
                @if (!previewIsMine && (chat()?.type === 'group' || chat()?.type === 'channel')) {
                  <div class="text-xs font-semibold text-telegram-primary mb-0.5">
                    {{ chatService.getUserById(activeMsg.senderId)?.name }}
                  </div>
                }

                @if (activeMsg.voice) {
                  <app-voice-player
                    [audioUrl]="activeMsg.voice.url"
                    [durationMs]="activeMsg.voice.durationMs"
                    [waveform]="activeMsg.voice.waveform"
                    [isMine]="previewIsMine"
                  ></app-voice-player>
                }

                @if (activeMsg.text) {
                  <p class="leading-relaxed whitespace-pre-wrap break-words">{{ activeMsg.text }}</p>
                }

                <div
                  class="flex items-center gap-1 text-[10px] mt-0.5 justify-end ml-3"
                  [class]="previewIsMine ? 'text-white/60' : 'text-telegram-muted'"
                >
                  <span class="tabular-nums">{{ activeMsg.timestamp | shortTime }}</span>
                </div>
              </div>

              @if (activeMsg.reactions && activeMsg.reactions.length > 0) {
                <div class="flex flex-wrap gap-1 mt-1">
                  @for (reaction of activeMsg.reactions; track reaction.emoji) {
                    <span
                      class="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border"
                      [class]="reaction.userIds.includes(chatService.currentUser().id)
                        ? 'bg-telegram-primary/20 border-telegram-primary/40 text-telegram-primary'
                        : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700'"
                    >
                      <span>{{ reaction.emoji }}</span>
                      <span class="font-medium">{{ reaction.userIds.length }}</span>
                    </span>
                  }
                </div>
              }
            </div>

            <div id="context-preview-reactions" class="flex items-center justify-center gap-1 bg-white dark:bg-telegram-surface rounded-full p-1.5 shadow-xl">
              @for (emoji of contextReactionEmojis; track emoji) {
                <button
                  class="w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all hover:scale-125 active:scale-90"
                  (click)="onContextReaction(emoji)"
                >
                  {{ emoji }}
                </button>
              }
            </div>

            <div id="context-preview-actions" class="bg-white dark:bg-telegram-surface rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700/50 p-1">
              <div class="flex items-center gap-1">
                <button
                  class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  (click)="onContextAction('reply')"
                >
                  <i class="ph ph-arrow-bend-up-left text-lg"></i>
                  <span>Reply</span>
                </button>
                <button
                  class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  (click)="onContextAction('forward')"
                >
                  <i class="ph ph-share text-lg"></i>
                  <span>Forward</span>
                </button>
                <button
                  class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  (click)="onContextAction('copy')"
                >
                  <i class="ph ph-copy text-lg"></i>
                  <span>Copy</span>
                </button>
                <button
                  class="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  (click)="onContextAction('delete')"
                >
                  <i class="ph ph-trash text-lg"></i>
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      }

      @if (showPeerProfileCard() && peerProfile()) {
        @let info = peerProfile()!;
        <div
          id="peer-profile-backdrop"
          class="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style="background: rgba(10, 14, 20, 0.42); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);"
          (click)="closePeerProfileCard()"
        >
          <div id="peer-profile-card" class="w-full" style="max-width: 360px;" (click)="$event.stopPropagation()">
            <div id="peer-profile-island" class="flex flex-col gap-3">
              <div class="profile-field flex items-center justify-between bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-sm font-semibold text-telegram-primary">Profile</span>
                <button class="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors active:scale-90" (click)="closePeerProfileCard()">
                  <i class="ph ph-x text-lg"></i>
                </button>
              </div>

              <div class="profile-field flex flex-col items-center gap-2 bg-white/90 dark:bg-telegram-surface rounded-3xl border border-gray-200 dark:border-gray-700/50 shadow-md px-4 py-3" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <div id="peer-profile-avatar" class="w-16 h-16 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 shadow-md">
                  @if (info.avatarUrl) {
                    <img [src]="info.avatarUrl" class="w-full h-full" style="object-fit: cover;" alt="Profile avatar">
                  } @else {
                    <div class="w-full h-full bg-telegram-primary text-white flex items-center justify-center font-bold text-xl">
                      {{ profileInitial(info.name) }}
                    </div>
                  }
                </div>
                <div class="min-w-0 text-center">
                  <div class="font-semibold truncate">{{ info.name }}</div>
                  <div class="text-xs text-telegram-muted truncate">{{ info.status }}</div>
                </div>
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Name</span>
                <div class="text-sm font-medium">{{ info.name }}</div>
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Username</span>
                <div class="text-sm">{{ '@' + info.username }}</div>
              </div>

              <div class="profile-field flex flex-col gap-1 bg-white/90 dark:bg-telegram-surface rounded-2xl border border-gray-200 dark:border-gray-700/50 shadow-md px-3 py-2" style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);">
                <span class="text-xs text-telegram-muted">Bio</span>
                <p class="text-sm leading-relaxed whitespace-pre-wrap break-words">{{ info.bio }}</p>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Emoji Picker -->
      @if (showEmojiPicker()) {
        <div class="absolute bottom-[80px] left-3 right-3 z-30 flex justify-center" id="emoji-picker-panel">
          <app-emoji-picker (emojiSelected)="onEmojiSelected($event)"></app-emoji-picker>
        </div>
        <div class="fixed inset-0 z-20" (click)="showEmojiPicker.set(false)"></div>
      }

      <!-- Reply Bar — Island -->
      @if (replyingTo()) {
        <div class="absolute bottom-[80px] left-3 right-3 px-3 py-2 flex items-center gap-2 z-30 bg-white dark:bg-telegram-surface rounded-2xl shadow-md shadow-black/5 dark:shadow-black/20" id="reply-bar">
          <div class="w-0.5 h-8 bg-telegram-primary rounded-full shrink-0"></div>
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-telegram-primary">{{ chatService.getUserById(replyingTo()!.senderId)?.name }}</div>
            <div class="text-xs text-gray-500 truncate">{{ replyingTo()!.text?.substring(0, 60) || 'Voice message' }}</div>
          </div>
          <button (click)="cancelReply()" class="p-1 text-gray-400 hover:text-gray-600 transition-colors active:scale-90">
            <i class="ph ph-x text-lg"></i>
          </button>
        </div>
      }

      <!-- Attachment Panel — Island -->
      @if (showAttachmentPanel()) {
        <div class="absolute bottom-[80px] left-3 right-3 p-4 z-30 bg-white dark:bg-telegram-surface shadow-xl rounded-2xl"
             id="attachment-panel">
          <div class="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4"></div>
          <div class="grid grid-cols-4 gap-4">
            <button class="flex flex-col items-center gap-2 group" (click)="openGalleryPicker()">
              <div class="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center text-2xl group-active:scale-90 transition-transform"><i class="ph-fill ph-image"></i></div>
              <span class="text-xs font-medium">Gallery</span>
            </button>
            <button class="flex flex-col items-center gap-2 group" (click)="openFilePicker()">
              <div class="w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center text-2xl group-active:scale-90 transition-transform"><i class="ph-fill ph-file-text"></i></div>
              <span class="text-xs font-medium">File</span>
            </button>
            <button class="flex flex-col items-center gap-2 group" (click)="shareCurrentLocation()">
              <div class="w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center text-2xl group-active:scale-90 transition-transform"><i class="ph-fill ph-map-pin"></i></div>
              <span class="text-xs font-medium">Location</span>
            </button>
            <button class="flex flex-col items-center gap-2 group" (click)="toggleAttachmentPanel()">
              <div class="w-14 h-14 rounded-2xl bg-gray-500/10 text-gray-500 flex items-center justify-center text-2xl group-active:scale-90 transition-transform"><i class="ph ph-x"></i></div>
              <span class="text-xs font-medium">Cancel</span>
            </button>
          </div>
        </div>
      }

      <!-- Input Area — Floating Island -->
      <input
        #galleryInput
        type="file"
        accept="image/*,video/*"
        class="hidden"
        multiple
        (change)="onGalleryFilesSelected($event)"
      >
      <input
        #fileInput
        type="file"
        class="hidden"
        multiple
        (change)="onFileSelected($event)"
      >

      @if (pendingAttachments().length > 0) {
        <div
          class="absolute z-30 bg-white dark:bg-telegram-surface rounded-2xl shadow-md px-3 py-2 w-[230px] max-w-[calc(100%-1.5rem)]"
          style="left: 0.75rem;"
          [style.bottom]="replyingTo() ? '6.3rem' : '4.55rem'"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs text-telegram-muted">
              @if (isUploadingAttachments()) {
                Uploading...
              } @else {
                {{ pendingAttachments().length }} file(s) ready
              }
            </span>
            <button class="text-xs text-red-500 disabled:opacity-50" (click)="clearPendingAttachments()" [disabled]="isUploadingAttachments()">
              Clear
            </button>
          </div>
          <div class="flex gap-2 overflow-y-hidden overflow-x-auto no-scrollbar">
            @for (att of pendingAttachments(); track att.id) {
              <div class="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0">
                @if (att.type === 'image') {
                  <img [src]="att.url" [alt]="att.name || 'Attachment'" class="w-full h-full" style="object-fit: cover;">
                } @else {
                  <div class="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-telegram-primary">
                    <i [class]="attachmentIcon(att) + ' text-xl'"></i>
                  </div>
                }
                <button
                  class="absolute top-0 right-0 w-5 h-5 rounded-full bg-black/40 text-white text-xs flex items-center justify-center"
                  (click)="removePendingAttachment(att.id, $event)"
                  [disabled]="isUploadingAttachments()"
                >
                  <i class="ph ph-x"></i>
                </button>
              </div>
            }
          </div>
        </div>
      }

      <footer class="safe-pb absolute bottom-0 left-0 right-0 z-20 px-4 pb-2 pt-2">
        <div
          class="flex items-end px-3 py-2 gap-1.5 min-h-[52px] bg-white/90 dark:bg-telegram-surface rounded-3xl shadow-xl border border-gray-200 dark:border-gray-700/50"
          style="backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);"
        >
          <!-- Emoji Button -->
          <button 
            (click)="toggleEmojiPicker()" 
            class="p-1.5 transition-all mb-0.5 shrink-0 active:scale-90"
            [class]="showEmojiPicker() ? 'text-telegram-primary' : 'text-gray-400 hover:text-telegram-primary'"
          >
            <i class="ph ph-smiley text-2xl"></i>
          </button>
          
          <div class="flex-1 flex items-center relative min-h-[36px] max-h-[120px]">
            @if (voiceRecorder.isRecording()) {
              <div class="flex-1 flex items-center justify-between px-2 h-9">
                <div class="flex items-center gap-2">
                  <div class="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></div>
                  <span class="font-mono text-red-400 font-medium tabular-nums text-sm">{{ formatDuration(voiceRecorder.recordingDuration()) }}</span>
                </div>
                <span class="text-xs text-telegram-muted">← Slide to cancel</span>
              </div>
            } @else {
              <textarea 
                #messageInput
                [ngModel]="inputText()"
                (ngModelChange)="onInputTextChange($event)"
                (input)="autoGrow($event)"
                (keydown.enter)="handleEnter($event)"
                placeholder="Message" 
                class="w-full bg-transparent text-black dark:text-white py-2 outline-none resize-none no-scrollbar max-h-[120px] placeholder-gray-400 dark:placeholder-gray-500 text-[15px] leading-snug"
                style="border: none; box-shadow: none;"
                rows="1"
              ></textarea>
            }
          </div>

          <!-- Attachment -->
          <button (click)="toggleAttachmentPanel()" class="p-1.5 text-gray-400 hover:text-telegram-primary transition-all mb-0.5 shrink-0 active:scale-90">
            <i class="ph ph-paperclip text-xl transform -rotate-45"></i>
          </button>

          <!-- Send / Mic -->
          <div
            class="relative h-9 shrink-0 mb-0.5 flex items-center justify-end overflow-visible"
            [style.width]="voiceRecorder.isRecording() ? '5rem' : '2.25rem'"
          >
            @if (voiceRecorder.isRecording()) {
              <div class="absolute right-0 w-full flex items-center justify-end gap-2">
                <button (click)="cancelRecording()" class="w-9 h-9 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <i class="ph-fill ph-trash text-lg"></i>
                </button>
                <button (click)="stopAndSendRecording()" class="w-9 h-9 rounded-full bg-telegram-primary text-white flex items-center justify-center shrink-0 active:scale-90 transition-transform">
                  <i class="ph-fill ph-paper-plane-right text-lg"></i>
                </button>
              </div>
            } @else {
              <button #sendBtn (click)="initiateSendMessage()" [disabled]="isUploadingAttachments()" class="absolute inset-0 w-9 h-9 rounded-full bg-telegram-primary text-white flex items-center justify-center opacity-0 scale-50 pointer-events-none origin-center shadow-md disabled:opacity-70">
                <i class="ph-fill ph-paper-plane-right text-lg"></i>
              </button>
              
              <button #micBtn (click)="startRecording()" class="absolute inset-0 w-9 h-9 rounded-full text-telegram-primary hover:bg-white/10 flex items-center justify-center origin-center active:scale-90 transition-all">
                <i class="ph-fill ph-microphone text-2xl"></i>
              </button>
            }
          </div>
        </div>
      </footer>
    </div>
  `
})
export class ChatRoomComponent implements OnDestroy {
  chatService = inject(ChatService);
  private api = inject(ApiService);
  voiceRecorder = inject(VoiceRecorderService);
  animationService = inject(AnimationService);
  audioService = inject(AudioService);
  themeService = inject(ThemeService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  
  messagesContainer = viewChild<ElementRef>('messagesContainer');
  messageInput = viewChild<ElementRef>('messageInput');
  sendBtn = viewChild<ElementRef>('sendBtn');
  micBtn = viewChild<ElementRef>('micBtn');
  peerProfileTrigger = viewChild<ElementRef>('peerProfileTrigger');
  galleryInput = viewChild<ElementRef>('galleryInput');
  fileInput = viewChild<ElementRef>('fileInput');

  chatId = '';
  inputText = signal('');
  hasText = signal(false);
  showEmojiPicker = signal(false);
  showScrollBtn = signal(false);
  
  // All UI state as signals for zoneless compatibility
  showAttachmentPanel = signal(false);
  replyingTo = signal<Message | null>(null);
  pendingAttachments = signal<Attachment[]>([]);
  isDraggingFiles = signal(false);
  isUploadingAttachments = signal(false);
  private transientAttachmentUrls = new Set<string>();
  private pendingAttachmentFiles = new Map<string, File>();

  // Message action preview
  contextMenuMsg = signal<Message | null>(null);
  contextReactionEmojis = CONTEXT_REACTION_EMOJIS;
  private isClosingContextPreview = false;

  // Header peer profile preview
  showPeerProfileCard = signal(false);
  private isClosingPeerProfileCard = false;
  
  Math = Math;

  // Swipe — all signals for zoneless
  swipingMsgId = signal<string | null>(null);
  swipeX = signal(0);
  private swipeStartX = 0;
  private swipeStartY = 0;
  private swipeDirectionLocked: 'h' | 'v' | null = null;

  // Scroll rAF throttle
  private scrollRafId: number | null = null;
  private routeSub: any;

  chat = computed(() => this.chatService.getChatById(this.chatId));
  participant = computed(() => {
    const c = this.chat();
    return c ? this.chatService.getParticipant(c) : undefined;
  });
  messages = computed(() => this.chatService.getMessagesForChat(this.chatId)());

  isTyping = computed(() => {
    const typing = this.chatService.getTypingUsersForChat(this.chatId);
    return typing.length > 0;
  });

  statusString = computed(() => {
    const c = this.chat();
    if (!c) return '';
    if (c.type === 'saved') return '';
    const typing = this.chatService.getTypingUsersForChat(this.chatId);
    if (typing.length > 0) {
      if (c.type === 'direct') return 'typing...';
      const names = typing.map(id => this.chatService.getUserById(id)?.name?.split(' ')[0]).filter(Boolean);
      return names.join(', ') + ' typing...';
    }
    if (c.type === 'group') return `${c.memberCount || c.participants.length} members`;
    if (c.type === 'channel') return `${c.memberCount?.toLocaleString()} subscribers`;
    return this.participant()?.isOnline ? 'online' : 'last seen recently';
  });

  peerProfile = computed<PeerProfileInfo | null>(() => {
    const c = this.chat();
    if (!c) return null;
    if (c.type === 'saved') return null;

    if (c.type === 'direct') {
      const p = this.participant();
      if (!p) return null;
      return {
        name: p.name || 'User',
        username: this.normalizeProfileHandle(p.username || p.name || 'user'),
        bio: p.bio || 'No bio yet',
        avatarUrl: p.avatarUrl,
        status: p.isOnline ? 'online' : 'last seen recently'
      };
    }

    const fallbackMembers = c.memberCount || c.participants.length;
    const status = c.type === 'group'
      ? `${fallbackMembers} members`
      : `${c.memberCount?.toLocaleString() || 0} subscribers`;
    return {
      name: c.name || 'Chat',
      username: this.normalizeProfileHandle(c.name || c.id || 'chat'),
      bio: c.description || status,
      avatarUrl: c.avatarUrl,
      status
    };
  });

  displayItems = computed(() => {
    const msgs = this.messages();
    const items: DisplayItem[] = [];
    let lastDate = '';
    let lastSenderId = '';

    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i];
      const msgDate = this.getDateLabel(msg.timestamp);
      
      if (msgDate !== lastDate) {
        items.push({ type: 'date', key: 'date-' + msgDate, dateLabel: msgDate });
        lastDate = msgDate;
        lastSenderId = '';
      }

      const isGrouped = msg.senderId === lastSenderId;
      const nextMsg = msgs[i + 1];
      const showTail = !nextMsg || nextMsg.senderId !== msg.senderId || this.getDateLabel(nextMsg.timestamp) !== msgDate;

      items.push({ 
        type: 'message', 
        key: msg.id, 
        message: msg, 
        isGrouped: isGrouped,
        showTail: showTail
      });
      lastSenderId = msg.senderId;
    }
    return items;
  });

  private messageCount = 0;

  constructor() {
    this.routeSub = this.route.params.subscribe(params => {
      this.chatId = params['id'];
      this.chatService.markAsRead(this.chatId);
      
      afterNextRender(() => {
        this.scrollToBottom();
        this.animationService.pageTransitionIn('#chat-room-container');
        this.messageCount = this.messages().length;
        // Attach passive scroll listener
        this.attachScrollListener();
      });
    });

    effect(() => {
      const hasContent = this.hasText() || this.pendingAttachments().length > 0;
      const sBtn = this.sendBtn()?.nativeElement;
      const mBtn = this.micBtn()?.nativeElement;
      
      if (sBtn && mBtn) {
        this.animationService.toggleActionButtons(hasContent, sBtn, mBtn);
        sBtn.style.pointerEvents = hasContent ? 'auto' : 'none';
        mBtn.style.pointerEvents = !hasContent ? 'auto' : 'none';
      }
    });

    effect(() => {
      const msgs = this.messages();
      if (msgs.length > this.messageCount) {
        this.messageCount = msgs.length;
        setTimeout(() => this.scrollToBottom(), 50);
      }
    });
  }

  ngOnDestroy() {
    this.routeSub?.unsubscribe();
    if (this.scrollRafId) cancelAnimationFrame(this.scrollRafId);
    const el = this.messagesContainer()?.nativeElement;
    if (el) el.removeEventListener('scroll', this.scrollHandler);
    for (const url of this.transientAttachmentUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch { }
    }
    this.transientAttachmentUrls.clear();
    this.pendingAttachmentFiles.clear();
  }

  /** Attach passive scroll listener for better performance */
  private scrollHandler = () => {
    if (this.scrollRafId) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      const el = this.messagesContainer()?.nativeElement;
      if (!el) return;
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      this.showScrollBtn.set(distFromBottom > 200);
    });
  };

  private attachScrollListener() {
    const el = this.messagesContainer()?.nativeElement;
    if (el) {
      el.addEventListener('scroll', this.scrollHandler, { passive: true });
    }
  }

  getDateLabel(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000 && d.getDate() === now.getDate()) return 'Today';
    if (diff < 172800000) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  onInputTextChange(val: string) {
    this.inputText.set(val);
    this.updateHasContentState();
  }

  handleEnter(event: Event) {
    event.preventDefault();
    this.initiateSendMessage();
  }

  goBack() {
    this.animationService.pageTransitionOut('#chat-room-container', () => {
      this.router.navigate(['/']);
    });
  }

  scrollToBottom() {
    const el = this.messagesContainer()?.nativeElement;
    if (el) {
      this.animationService.smoothScrollTo(el, el.scrollHeight);
    }
  }

  scrollToMessage(msgId: string) {
    const el = document.getElementById('msg-' + msgId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(el,
          { backgroundColor: 'rgba(51,144,236,0.2)' },
          { backgroundColor: 'transparent', duration: 1.5, ease: 'power2.out' }
        );
      }
    }
  }

  autoGrow(event: Event) {
    const textArea = event.target as HTMLTextAreaElement;
    textArea.style.height = 'auto';
    textArea.style.height = Math.min(textArea.scrollHeight, 120) + 'px';
  }

  toggleAttachmentPanel() {
    this.showAttachmentPanel.update(v => !v);
    if (this.showAttachmentPanel()) {
      this.showEmojiPicker.set(false);
      setTimeout(() => {
        const panel = document.getElementById('attachment-panel');
        if (panel) this.animationService.slideInFromBottom(panel, 200);
      }, 0);
    }
  }

  toggleEmojiPicker() {
    this.showEmojiPicker.update(v => !v);
    if (this.showEmojiPicker()) {
      this.showAttachmentPanel.set(false);
      setTimeout(() => {
        const panel = document.getElementById('emoji-picker-panel');
        if (panel) this.animationService.slideInFromBottom(panel, 200);
      }, 0);
    }
  }

  onEmojiSelected(emoji: string) {
    this.inputText.update(t => t + emoji);
    this.updateHasContentState();
  }

  openGalleryPicker() {
    this.showAttachmentPanel.set(false);
    const input = this.galleryInput()?.nativeElement as HTMLInputElement | undefined;
    if (!input) return;
    input.value = '';
    input.click();
  }

  openFilePicker() {
    this.showAttachmentPanel.set(false);
    const input = this.fileInput()?.nativeElement as HTMLInputElement | undefined;
    if (!input) return;
    input.value = '';
    input.click();
  }

  onGalleryFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.addFilesToPending(files);
    input.value = '';
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.addFilesToPending(files);
    input.value = '';
  }

  removePendingAttachment(attachmentId: string, event?: Event) {
    event?.stopPropagation();
    if (this.isUploadingAttachments()) return;
    let removedUrl: string | undefined;
    this.pendingAttachments.update(items => {
      const next: Attachment[] = [];
      for (const item of items) {
        if (item.id === attachmentId) {
          removedUrl = item.url;
          continue;
        }
        next.push(item);
      }
      return next;
    });

    if (removedUrl) this.revokeTransientUrl(removedUrl);
    this.pendingAttachmentFiles.delete(attachmentId);
    this.updateHasContentState();
  }

  clearPendingAttachments() {
    if (this.isUploadingAttachments()) return;
    const urls = this.pendingAttachments().map(a => a.url);
    this.pendingAttachments.set([]);
    this.pendingAttachmentFiles.clear();
    for (const url of urls) {
      this.revokeTransientUrl(url);
    }
    this.updateHasContentState();
  }

  attachmentIcon(att: Attachment): string {
    if (att.type === 'image') return 'ph-fill ph-image';
    if (att.type === 'video') return 'ph-fill ph-video-camera';
    if (att.type === 'audio') return 'ph-fill ph-music-notes';
    return 'ph-fill ph-file-text';
  }

  attachmentDisplayName(att: Attachment): string {
    if (att.name && att.name.trim().length > 0) return att.name;
    if (att.type === 'image') return 'Photo';
    if (att.type === 'video') return 'Video';
    if (att.type === 'audio') return 'Audio';
    return 'File';
  }

  attachmentMeta(att: Attachment): string {
    const ext = this.getFileExtension(att.name);
    const size = this.formatFileSize(att.size);
    if (ext && size) return `${ext.toUpperCase()} • ${size}`;
    if (ext) return ext.toUpperCase();
    if (size) return size;
    return 'Attachment';
  }

  private getFileExtension(fileName?: string): string {
    if (!fileName) return '';
    const parts = fileName.split('.');
    if (parts.length <= 1) return '';
    return parts[parts.length - 1];
  }

  private formatFileSize(size?: number): string {
    if (!size || size <= 0) return '';
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  }

  openAttachment(att: Attachment, event?: Event) {
    event?.stopPropagation();
    window.open(att.url, '_blank', 'noopener,noreferrer');
  }

  onDragOver(event: DragEvent) {
    const hasFiles = !!event.dataTransfer?.types && Array.from(event.dataTransfer.types).includes('Files');
    if (!hasFiles) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.isDraggingFiles.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const host = event.currentTarget as HTMLElement | null;
    if (!host) {
      this.isDraggingFiles.set(false);
      return;
    }

    const rect = host.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    const leftHost = x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom;
    if (leftHost) this.isDraggingFiles.set(false);
  }

  onDropFiles(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingFiles.set(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    this.addFilesToPending(files);
  }

  shareCurrentLocation() {
    this.showAttachmentPanel.set(false);
    if (!navigator.geolocation) {
      this.sendQuickMessage('📍 Location is not available on this device.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`;
        const locationAttachment: Attachment = {
          id: this.randomId('att'),
          type: 'document',
          url: mapsUrl,
          name: `Location (${lat.toFixed(5)}, ${lng.toFixed(5)})`
        };
        this.sendQuickMessage('📍 Shared location', [locationAttachment]);
      },
      () => {
        this.sendQuickMessage('📍 Could not access your location.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  private addFilesToPending(files: File[]) {
    if (!files || files.length === 0) return;
    const mapped = files
      .filter(f => f.size > 0)
      .map(f => this.createAttachmentFromFile(f));
    if (mapped.length === 0) return;

    this.pendingAttachments.update(items => [...items, ...mapped]);
    this.showEmojiPicker.set(false);
    this.showAttachmentPanel.set(false);
    this.updateHasContentState();
  }

  private createAttachmentFromFile(file: File): Attachment {
    const url = URL.createObjectURL(file);
    const id = this.randomId('att');
    this.transientAttachmentUrls.add(url);
    this.pendingAttachmentFiles.set(id, file);
    return {
      id,
      type: this.resolveAttachmentType(file),
      url,
      name: file.name,
      size: file.size
    };
  }

  private resolveAttachmentType(file: File): Attachment['type'] {
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  }

  private async uploadPendingAttachments(attachments: Attachment[]): Promise<Attachment[]> {
    return await Promise.all(attachments.map(async att => {
      const file = this.pendingAttachmentFiles.get(att.id);
      if (!file) return { ...att };

      const uploaded = await firstValueFrom(this.api.uploadAttachment(file));
      return {
        ...att,
        url: uploaded.url
      };
    }));
  }

  private sendQuickMessage(text: string, attachments?: Attachment[]) {
    const tempId = this.randomId('m');
    this.chatService.addMessage({
      id: tempId,
      chatId: this.chatId,
      senderId: this.chatService.currentUser().id,
      text,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now(),
      status: 'sent'
    });
    this.audioService.playSendSound();
    setTimeout(() => {
      this.scrollToBottom();
      const el = document.getElementById('msg-' + tempId);
      if (el) this.animationService.popInMessage(el);
    }, 50);
  }

  private buildAttachmentSummaryText(text: string, attachments: Attachment[]): string {
    const trimmed = text.trim();
    if (trimmed.length > 0) return trimmed;
    if (attachments.length === 1) {
      const first = attachments[0];
      if (first.type === 'image') return '🖼 Photo';
      if (first.type === 'video') return '🎬 Video';
      if (first.type === 'audio') return '🎵 Audio';
      return `📎 ${first.name || 'File'}`;
    }
    return `📎 ${attachments.length} attachments`;
  }

  private randomId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private revokeTransientUrl(url: string) {
    if (!url.startsWith('blob:')) return;
    if (!this.transientAttachmentUrls.has(url)) return;
    try {
      URL.revokeObjectURL(url);
    } catch { }
    this.transientAttachmentUrls.delete(url);
  }

  private updateHasContentState() {
    const hasContent = this.inputText().trim().length > 0 || this.pendingAttachments().length > 0;
    this.hasText.set(hasContent);
  }

  // ========== Peer Profile Preview ==========

  openPeerProfile(event: MouseEvent) {
    if (this.showPeerProfileCard()) return;
    if (!this.peerProfile()) return;

    this.showEmojiPicker.set(false);
    this.showAttachmentPanel.set(false);
    this.contextMenuMsg.set(null);
    this.showPeerProfileCard.set(true);
    this.isClosingPeerProfileCard = false;
    setTimeout(() => this.animatePeerProfileIn(event.currentTarget as HTMLElement), 0);
  }

  closePeerProfileCard() {
    if (!this.showPeerProfileCard() || this.isClosingPeerProfileCard) return;
    const backdrop = document.getElementById('peer-profile-backdrop');
    const card = document.getElementById('peer-profile-card');
    const avatar = document.getElementById('peer-profile-avatar');
    const trigger = this.peerProfileTrigger()?.nativeElement as HTMLElement | undefined;

    if (typeof gsap === 'undefined' || !backdrop || !card) {
      this.showPeerProfileCard.set(false);
      this.isClosingPeerProfileCard = false;
      return;
    }

    this.isClosingPeerProfileCard = true;
    const tl = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.showPeerProfileCard.set(false);
        this.isClosingPeerProfileCard = false;
      }
    });

    if (avatar && trigger) {
      const fromRect = avatar.getBoundingClientRect();
      const toRect = trigger.getBoundingClientRect();
      const clone = avatar.cloneNode(true) as HTMLElement;
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

  profileInitial(name: string): string {
    return (name || 'U').trim().charAt(0).toUpperCase() || 'U';
  }

  private normalizeProfileHandle(raw: string): string {
    const normalized = raw.replace(/^@+/, '').replace(/\s+/g, '_').toLowerCase();
    return normalized || 'user';
  }

  private animatePeerProfileIn(sourceEl?: HTMLElement) {
    const backdrop = document.getElementById('peer-profile-backdrop');
    const card = document.getElementById('peer-profile-card');
    const island = document.getElementById('peer-profile-island');
    const avatar = document.getElementById('peer-profile-avatar');
    if (!backdrop || !card || !island || typeof gsap === 'undefined') return;

    gsap.set(backdrop, { opacity: 0 });
    gsap.set(card, { opacity: 0, y: 24, scale: 0.94 });

    const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
    tl.to(backdrop, { opacity: 1, duration: 0.22, ease: 'power1.out' }, 0);

    if (sourceEl && avatar) {
      const sourceRect = sourceEl.getBoundingClientRect();
      const targetRect = avatar.getBoundingClientRect();
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

  // ========== Message Preview Actions ==========

  onContextMenu(event: MouseEvent | TouchEvent, msg: Message) {
    event.preventDefault();
    this.showEmojiPicker.set(false);
    this.showAttachmentPanel.set(false);
    this.isClosingContextPreview = false;
    this.contextMenuMsg.set(msg);
    setTimeout(() => this.animateContextPreview(msg.id), 0);
  }

  closeContextPreview() {
    if (!this.contextMenuMsg()) return;
    const backdropEl = document.getElementById('context-preview-backdrop');
    const cardEl = document.getElementById('context-preview-card');
    if (typeof gsap === 'undefined' || !backdropEl || !cardEl) {
      this.contextMenuMsg.set(null);
      this.isClosingContextPreview = false;
      return;
    }
    if (this.isClosingContextPreview) return;

    this.isClosingContextPreview = true;
    gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        this.contextMenuMsg.set(null);
        this.isClosingContextPreview = false;
      }
    })
    .to(cardEl, {
      y: 14,
      scale: 0.96,
      opacity: 0,
      duration: 0.16,
      ease: 'power2.in'
    }, 0)
    .to(backdropEl, {
      opacity: 0,
      duration: 0.14,
      ease: 'power1.in'
    }, 0);
  }

  onContextAction(action: string) {
    const msg = this.contextMenuMsg();
    if (!msg) return;

    switch (action) {
      case 'reply':
        this.replyingTo.set(msg);
        setTimeout(() => {
          this.messageInput()?.nativeElement.focus();
          const bar = document.getElementById('reply-bar');
          if (bar) this.animationService.slideInFromBottom(bar, 50);
        }, 180);
        break;
      case 'copy':
        if (msg.text) {
          navigator.clipboard.writeText(msg.text).catch(() => {});
        }
        break;
      case 'forward':
        this.forwardMessage(msg);
        break;
      case 'delete':
        this.chatService.deleteMessage(msg.id);
        break;
    }

    this.closeContextPreview();
  }

  onContextReaction(emoji: string) {
    const msg = this.contextMenuMsg();
    if (!msg) return;
    this.chatService.addReaction(msg.id, emoji);
    const el = document.getElementById('msg-' + msg.id);
    if (el) {
      const rect = el.getBoundingClientRect();
      this.animationService.confettiExplosion(rect.left + rect.width / 2, rect.top);
    }
    this.closeContextPreview();
  }

  private forwardMessage(msg: Message) {
    const hasPayload = !!msg.text || !!msg.voice;
    if (!hasPayload) return;
    const tempId = 'm_' + Math.random().toString(36).substring(2, 9);
    this.chatService.addMessage({
      id: tempId,
      chatId: this.chatId,
      senderId: this.chatService.currentUser().id,
      text: msg.text ? `Forwarded:\n${msg.text}` : undefined,
      timestamp: Date.now(),
      status: 'sent',
      replyToId: msg.id,
      voice: msg.voice ? { ...msg.voice } : undefined
    });
    this.audioService.playSendSound();
    setTimeout(() => {
      this.scrollToBottom();
      const bubble = document.getElementById('msg-' + tempId);
      if (bubble) this.animationService.popInMessage(bubble);
    }, 50);
  }

  private animateContextPreview(msgId: string) {
    if (typeof gsap === 'undefined') return;
    const sourceEl = document.getElementById('msg-' + msgId);
    const sourceBubble = sourceEl?.querySelector('.group') as HTMLElement | null;
    const backdropEl = document.getElementById('context-preview-backdrop');
    const cardEl = document.getElementById('context-preview-card');
    const messageEl = document.getElementById('context-preview-message');
    const previewBubbleEl = document.getElementById('context-preview-bubble');
    const reactionsEl = document.getElementById('context-preview-reactions');
    const actionsEl = document.getElementById('context-preview-actions');
    if (!backdropEl || !cardEl || !messageEl || !previewBubbleEl) return;

    gsap.set(backdropEl, { opacity: 0 });
    gsap.set(cardEl, { opacity: 1, y: 0, scale: 1 });
    gsap.set(messageEl, { opacity: 0 });
    if (reactionsEl) gsap.set(reactionsEl, { opacity: 0, y: 10 });
    if (actionsEl) gsap.set(actionsEl, { opacity: 0, y: 14 });

    if (!sourceBubble) {
      const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });
      tl.to(backdropEl, { opacity: 1, duration: 0.2, ease: 'power1.out' }, 0)
        .fromTo(cardEl,
          { y: 26, scale: 0.94, opacity: 0 },
          { y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(1.25)' },
          0
        )
        .to(messageEl, { opacity: 1, duration: 0.08, ease: 'none' }, 0.2);
      if (reactionsEl) {
        tl.to(reactionsEl, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.26);
      }
      if (actionsEl) {
        tl.to(actionsEl, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }, 0.3);
      }
      return;
    }

    const sourceRect = sourceBubble.getBoundingClientRect();
    const targetRect = previewBubbleEl.getBoundingClientRect();
    const clone = sourceBubble.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    clone.style.position = 'fixed';
    clone.style.left = `${sourceRect.left}px`;
    clone.style.top = `${sourceRect.top}px`;
    clone.style.width = `${sourceRect.width}px`;
    clone.style.height = `${sourceRect.height}px`;
    clone.style.margin = '0';
    clone.style.pointerEvents = 'none';
    clone.style.zIndex = '102';
    clone.style.overflow = 'hidden';
    clone.style.willChange = 'left, top, width, height, opacity';
    document.body.appendChild(clone);

    if (sourceEl) {
      gsap.fromTo(sourceEl, { scale: 1 }, { scale: 0.985, duration: 0.14, ease: 'power1.inOut', yoyo: true, repeat: 1 });
    }

    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => clone.remove()
    });
    timeline
      .to(backdropEl, { opacity: 1, duration: 0.2, ease: 'power1.out' }, 0)
      .to(clone, {
        left: targetRect.left,
        top: targetRect.top,
        width: targetRect.width,
        height: targetRect.height,
        borderRadius: getComputedStyle(previewBubbleEl).borderRadius,
        duration: 0.34,
        ease: 'power3.out'
      }, 0.02)
      .to(clone, { opacity: 0, duration: 0.12, ease: 'power2.in' }, 0.26)
      .to(messageEl, { opacity: 1, duration: 0.08, ease: 'none' }, 0.28);

    if (reactionsEl) {
      timeline.to(reactionsEl, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out' }, 0.34);
    }
    if (actionsEl) {
      timeline.to(actionsEl, { opacity: 1, y: 0, duration: 0.22, ease: 'power2.out' }, 0.38);
    }
  }

  toggleReaction(msgId: string, emoji: string, event: MouseEvent) {
    this.chatService.addReaction(msgId, emoji);
    this.animationService.elasticButton(event.currentTarget as HTMLElement);
  }

  cancelReply() {
    this.replyingTo.set(null);
  }

  // ========== Send Message ==========

  async initiateSendMessage() {
    const rawText = this.inputText().trim();
    const attachments = this.pendingAttachments().map(a => ({ ...a }));
    if (rawText.length === 0 && attachments.length === 0) return;
    if (this.isUploadingAttachments()) return;

    const sourceTextEl = this.messageInput()?.nativeElement;
    if (!sourceTextEl) return;

    let uploadedAttachments = attachments;
    if (attachments.length > 0) {
      this.isUploadingAttachments.set(true);
      try {
        uploadedAttachments = await this.uploadPendingAttachments(attachments);
      } catch (err) {
        console.error('Failed to upload attachment(s):', err);
        this.isUploadingAttachments.set(false);
        return;
      }
      this.isUploadingAttachments.set(false);
    }

    const finalText = this.buildAttachmentSummaryText(rawText, uploadedAttachments);
    const transientUrls = attachments.map(a => a.url);
    this.inputText.set('');
    this.pendingAttachments.set([]);
    this.pendingAttachmentFiles.clear();
    for (const url of transientUrls) {
      this.revokeTransientUrl(url);
    }
    this.updateHasContentState();
    sourceTextEl.style.height = 'auto';
    sourceTextEl.focus();

    const tempId = this.randomId('m');
    const reply = this.replyingTo();
    const newMsg: Message = {
      id: tempId,
      chatId: this.chatId,
      senderId: this.chatService.currentUser().id,
      text: finalText,
      attachments: uploadedAttachments.length > 0 ? uploadedAttachments.map(a => ({ ...a })) : undefined,
      timestamp: Date.now(),
      status: 'sending',
      isAnimating: true,
      replyToId: reply?.id,
    };

    this.replyingTo.set(null);
    this.showEmojiPicker.set(false);
    this.chatService.addMessage(newMsg);
    this.audioService.playSendSound();
    
    setTimeout(async () => {
      this.scrollToBottom();
      const targetPlaceholderEl = document.getElementById('msg-' + tempId);
      
      if (rawText.length > 0 && targetPlaceholderEl && sourceTextEl) {
        await this.animationService.animateSendText({
          sourceTextEl,
          targetPlaceholderEl,
          text: rawText,
          isMine: true
        });
      }
      
      this.chatService.updateMessage(tempId, { isAnimating: false, status: 'sent' });
      setTimeout(() => this.chatService.updateMessage(tempId, { status: 'delivered' }), 1000);
      setTimeout(() => this.chatService.updateMessage(tempId, { status: 'seen' }), 3000);
    }, 10);
  }

  // ========== Voice Recording ==========

  async startRecording() {
    await this.voiceRecorder.startRecording();
  }

  async stopAndSendRecording() {
    const result = await this.voiceRecorder.stopRecording();
    if (result && result.durationMs > 0) {
      const tempId = 'm_' + Math.random().toString(36).substring(2, 9);
      this.chatService.addMessage({
        id: tempId,
        chatId: this.chatId,
        senderId: this.chatService.currentUser().id,
        timestamp: Date.now(),
        status: 'sent',
        voice: {
          storageKey: result.storageKey,
          url: result.blobUrl,
          duration: Math.round(result.durationMs / 1000),
          durationMs: result.durationMs,
          waveform: result.waveform
        }
      });
      this.audioService.playSendSound();
      
      setTimeout(() => {
        this.scrollToBottom();
        const el = document.getElementById('msg-' + tempId);
        if (el) this.animationService.popInMessage(el);
      }, 50);
    }
  }
  
  cancelRecording() {
    this.voiceRecorder.cancelRecording();
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // ========== Swipe to Reply (direction-locked) ==========

  onTouchStart(e: TouchEvent, msg: Message) {
    this.swipingMsgId.set(msg.id);
    this.swipeStartX = e.touches[0].clientX;
    this.swipeStartY = e.touches[0].clientY;
    this.swipeX.set(0);
    this.swipeDirectionLocked = null;
  }

  onTouchMove(e: TouchEvent, msg: Message) {
    if (this.swipingMsgId() !== msg.id) return;
    const dx = e.touches[0].clientX - this.swipeStartX;
    const dy = e.touches[0].clientY - this.swipeStartY;

    // Lock direction after 8px of movement
    if (!this.swipeDirectionLocked) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        this.swipeDirectionLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      return;
    }

    // Vertical scroll — ignore swipe
    if (this.swipeDirectionLocked === 'v') return;

    // Horizontal swipe
    const isMine = msg.senderId === this.chatService.currentUser().id;
    if (isMine && dx < 0) this.swipeX.set(Math.max(dx, -60));
    else if (!isMine && dx > 0) this.swipeX.set(Math.min(dx, 60));
  }

  onTouchEnd(e: TouchEvent, msg: Message) {
    if (this.swipingMsgId() === msg.id) {
      if (Math.abs(this.swipeX()) > 40) {
        this.replyingTo.set(msg);
        this.messageInput()?.nativeElement.focus();
        if (navigator.vibrate) navigator.vibrate(50);
        setTimeout(() => {
          const bar = document.getElementById('reply-bar');
          if (bar) this.animationService.slideInFromBottom(bar, 50);
        }, 10);
      }
      this.swipeX.set(0);
      this.swipeDirectionLocked = null;
      setTimeout(() => this.swipingMsgId.set(null), 300);
    }
  }
}

interface DisplayItem {
  type: 'date' | 'message';
  key: string;
  dateLabel?: string;
  message?: Message;
  isGrouped?: boolean;
  showTail?: boolean;
}

interface PeerProfileInfo {
  name: string;
  username: string;
  bio: string;
  avatarUrl?: string;
  status: string;
}
