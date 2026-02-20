import { Component, input, output, ElementRef, viewChild, afterNextRender, inject, OnDestroy, signal } from '@angular/core';
import { AnimationService } from '../../core/services/animation.service';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon: string;
  danger?: boolean;
}

const REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

@Component({
  selector: 'app-context-menu',
  standalone: true,
  template: `
    <!-- Backdrop -->
    <div 
      class="fixed inset-0 z-[100] bg-black/40"
      (click)="close()"
    >
      <!-- Menu Container -->
      <div 
        #menuContainer
        class="absolute z-[101]"
        [style.left.px]="computedX()"
        [style.top.px]="computedY()"
        (click)="$event.stopPropagation()"
      >
        <!-- Reaction Bar -->
        @if (showReactions()) {
          <div class="flex items-center gap-1 bg-white dark:bg-[#2a2a2c] rounded-full p-1.5 shadow-xl mb-2 mx-auto w-fit" #reactionBar>
            @for (emoji of reactionEmojis; track emoji) {
              <button 
                class="reaction-item w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-all hover:scale-125 active:scale-90"
                (click)="onReaction(emoji)"
              >
                {{ emoji }}
              </button>
            }
          </div>
        }

        <!-- Menu Items -->
        <div class="bg-white dark:bg-[#2a2a2c] rounded-xl shadow-xl overflow-hidden min-w-[180px] border border-gray-100 dark:border-gray-700/50">
          @for (item of items(); track item.id) {
            <button 
              class="menu-item w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors text-sm"
              [class]="item.danger 
                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20' 
                : 'text-black dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50'"
              (click)="onItemClick(item)"
            >
              <i [class]="'ph ' + item.icon + ' text-lg'" [class.text-red-500]="item.danger"></i>
              <span>{{ item.label }}</span>
            </button>
          }
        </div>
      </div>
    </div>
  `
})
export class ContextMenuComponent implements OnDestroy {
  private animation = inject(AnimationService);
  
  x = input<number>(0);
  y = input<number>(0);
  items = input<ContextMenuItem[]>([]);
  showReactions = input<boolean>(false);

  itemClicked = output<string>();
  reactionSelected = output<string>();
  closed = output<void>();

  menuContainer = viewChild<ElementRef>('menuContainer');

  reactionEmojis = REACTION_EMOJIS;
  computedY = signal(0);
  computedX = signal(0);

  constructor() {
    afterNextRender(() => {
      const el = this.menuContainer()?.nativeElement;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const maxY = window.innerHeight - rect.height - 20;
      const maxX = window.innerWidth - rect.width - 16;
      this.computedY.set(Math.min(this.y(), Math.max(10, maxY)));
      this.computedX.set(Math.min(this.x(), Math.max(10, maxX)));

      // Animate entrance
      this.animation.staggerMenuItems(el, '.menu-item');
      if (this.showReactions()) {
        this.animation.staggerMenuItems(el, '.reaction-item');
      }
    });
  }

  onItemClick(item: ContextMenuItem) {
    this.itemClicked.emit(item.id);
    this.close();
  }

  onReaction(emoji: string) {
    this.reactionSelected.emit(emoji);
    this.close();
  }

  close() {
    this.closed.emit();
  }

  ngOnDestroy() {}
}
