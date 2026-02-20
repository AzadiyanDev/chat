import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'shortTime',
  standalone: true
})
export class ShortTimePipe implements PipeTransform {
  transform(value: number | undefined): string {
    if (!value) return '';
    const date = new Date(value);
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    const strMinutes = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + strMinutes + ' ' + ampm;
  }
}