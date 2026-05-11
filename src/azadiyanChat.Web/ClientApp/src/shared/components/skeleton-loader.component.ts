import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton-loader',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('chat-item') {
        <div class="flex items-center gap-3 px-4 py-3">
          <div class="w-12 h-12 rounded-full shimmer-bg bg-gray-200 dark:bg-gray-800 shrink-0"></div>
          <div class="flex-1 space-y-2">
            <div class="flex justify-between">
              <div class="h-4 w-28 rounded shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
              <div class="h-3 w-12 rounded shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
            </div>
            <div class="h-3.5 w-48 rounded shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
          </div>
        </div>
      }
      @case ('message-bubble') {
        <div class="flex flex-col gap-3 p-4">
          <div class="self-start w-3/5">
            <div class="h-12 rounded-2xl rounded-bl-sm shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
          </div>
          <div class="self-end w-2/5">
            <div class="h-10 rounded-2xl rounded-br-sm shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
          </div>
          <div class="self-start w-1/2">
            <div class="h-14 rounded-2xl rounded-bl-sm shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
          </div>
        </div>
      }
      @case ('avatar') {
        <div class="w-12 h-12 rounded-full shimmer-bg bg-gray-200 dark:bg-gray-800"></div>
      }
    }
  `
})
export class SkeletonLoaderComponent {
  variant = input<'chat-item' | 'message-bubble' | 'avatar'>('chat-item');
}
