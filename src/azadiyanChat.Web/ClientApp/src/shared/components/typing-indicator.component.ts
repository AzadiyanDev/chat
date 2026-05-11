import { Component } from '@angular/core';

@Component({
  selector: 'app-typing-indicator',
  standalone: true,
  template: `
    <div class="flex items-end gap-1 self-start max-w-[80%]">
      <div class="px-4 py-3 rounded-2xl rounded-bl-sm bg-white dark:bg-telegram-surface border border-gray-100 dark:border-gray-800 shadow-sm">
        <div class="flex items-center gap-1.5 h-4">
          <span class="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot-1"></span>
          <span class="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot-2"></span>
          <span class="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot-3"></span>
        </div>
      </div>
    </div>
  `
})
export class TypingIndicatorComponent {}
