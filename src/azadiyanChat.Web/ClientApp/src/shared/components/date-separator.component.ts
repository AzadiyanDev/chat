import { Component, input } from '@angular/core';

@Component({
  selector: 'app-date-separator',
  standalone: true,
  template: `
    <div class="flex items-center justify-center py-2 sticky top-0 z-10">
      <div class="px-3 py-1 rounded-full text-xs font-medium bg-black/10 dark:bg-white/10 text-gray-600 dark:text-gray-300 backdrop-blur-md shadow-sm">
        {{ label() }}
      </div>
    </div>
  `
})
export class DateSeparatorComponent {
  label = input.required<string>();
}
