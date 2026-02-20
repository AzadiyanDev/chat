import { Component, input, output, signal, computed } from '@angular/core';

const EMOJI_CATEGORIES = [
  { id: 'recent', label: 'Recent', icon: 'ph-clock' },
  { id: 'smileys', label: 'Smileys', icon: 'ph-smiley' },
  { id: 'hearts', label: 'Hearts', icon: 'ph-heart' },
  { id: 'hands', label: 'Hands', icon: 'ph-hand-waving' },
  { id: 'animals', label: 'Animals', icon: 'ph-cat' },
  { id: 'food', label: 'Food', icon: 'ph-hamburger' },
  { id: 'objects', label: 'Objects', icon: 'ph-lightbulb' },
  { id: 'symbols', label: 'Symbols', icon: 'ph-star' },
];

const EMOJIS: Record<string, string[]> = {
  smileys: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢','🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫠','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳','🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱'],
  hearts: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','♥️','🫶','🫀','💑','💏','😍','🥰','😘','😻','💌'],
  hands: ['👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛','🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💪','🫵'],
  animals: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🐢','🐍'],
  food: ['🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪'],
  objects: ['⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️','🗜️','💾','💿','📀','📼','📷','📸','📹','🎥','📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️','🎛️','🧭','⏱️','⏲️','⏰','🕰️','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵','💴','💶','💷','🪙','💰','💳'],
  symbols: ['❤️','🔥','⭐','✨','💫','🌟','💯','✅','❌','⚡','💥','💢','💤','💨','🎵','🎶','🔑','🔒','🔓','🏳️','🏴','🚩','🎌','🏁','♻️','💠','🔰','⚜️','🔱','📛','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🔺','🔻'],
};

// Flatten once for search
const ALL_EMOJIS = Object.values(EMOJIS).flat();

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  template: `
    <div class="flex flex-col bg-white dark:bg-telegram-surface rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700/50 overflow-hidden w-full max-w-[360px] min-w-[280px]" 
         style="height: 380px;"
         (click)="$event.stopPropagation()">
      
      <!-- Search -->
      <div class="px-3 pt-3 pb-2">
        <div class="relative">
          <i class="ph ph-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input 
            type="text" 
            placeholder="Search emoji..."
            class="w-full bg-gray-100 dark:bg-gray-800 text-sm rounded-lg py-1.5 pl-8 pr-3 outline-none text-black dark:text-white placeholder-gray-400"
            (input)="onSearch($event)"
          >
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="flex px-2 gap-0.5 border-b border-gray-100 dark:border-gray-700/50">
        @for (cat of categories; track cat.id) {
          <button 
            class="flex-1 py-1.5 flex justify-center items-center rounded-t-lg transition-colors text-sm"
            [class]="activeCategory() === cat.id ? 'text-telegram-primary bg-telegram-primary/10' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'"
            (click)="activeCategory.set(cat.id)"
          >
            <i [class]="'ph ' + cat.icon"></i>
          </button>
        }
      </div>

      <!-- Emoji Grid -->
      <div class="flex-1 overflow-y-auto no-scrollbar p-2">
        @if (searchQuery()) {
          <div class="grid grid-cols-8 gap-0.5">
            @for (emoji of filteredEmojis(); track $index) {
              <button 
                class="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-90"
                (click)="selectEmoji(emoji)"
              >
                {{ emoji }}
              </button>
            }
          </div>
        } @else {
          @if (activeCategory() === 'recent') {
            <div class="text-xs text-gray-400 px-1 pb-1 font-medium">Recently Used</div>
            <div class="grid grid-cols-8 gap-0.5">
              @for (emoji of recentEmojis(); track $index) {
                <button 
                  class="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-90"
                  (click)="selectEmoji(emoji)"
                >
                  {{ emoji }}
                </button>
              }
            </div>
          } @else {
            <div class="grid grid-cols-8 gap-0.5">
              @for (emoji of currentCategoryEmojis(); track $index) {
                <button 
                  class="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors active:scale-90"
                  (click)="selectEmoji(emoji)"
                >
                  {{ emoji }}
                </button>
              }
            </div>
          }
        }
      </div>
    </div>
  `
})
export class EmojiPickerComponent {
  emojiSelected = output<string>();

  categories = EMOJI_CATEGORIES;
  activeCategory = signal('smileys');
  searchQuery = signal('');
  recentEmojis = signal<string[]>(['😀','❤️','👍','🔥','😂','🎉','✨','🙏','😍','💯']);

  filteredEmojis = computed(() => {
    const q = this.searchQuery();
    if (!q) return [];
    return ALL_EMOJIS;
  });

  currentCategoryEmojis = computed(() => {
    return EMOJIS[this.activeCategory()] || [];
  });

  onSearch(event: Event) {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  selectEmoji(emoji: string) {
    this.recentEmojis.update(r => [emoji, ...r.filter(e => e !== emoji)].slice(0, 30));
    this.emojiSelected.emit(emoji);
  }
}
