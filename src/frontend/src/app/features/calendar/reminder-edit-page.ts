import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, Reminder } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { ReminderForm } from './reminder-form';

/** Edit a reminder (#173): the whole series, at once, with no approval. */
@Component({
  selector: 'app-reminder-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReminderForm],
  template: `
    <p class="back"><a routerLink="/calendar">← Calendar</a></p>
    <h1>Edit reminder</h1>
    @if (reminder(); as reminder) {
      <app-reminder-form [reminder]="reminder" />
    } @else if (error(); as message) {
      <div class="alert" role="alert">{{ message }}</div>
    } @else {
      <p role="status">Loading…</p>
    }
  `,
  styleUrl: './add-event-page.scss',
  styles: [FORM_STYLES],
})
export class ReminderEditPage implements OnInit {
  private readonly api = inject(Api);
  private readonly family = inject(AuthStore).currentFamily;

  /** The `:reminderId` route parameter. */
  readonly reminderId = input.required<string>();

  protected readonly reminder = signal<Reminder | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    const family = this.family();
    if (!family) {
      return;
    }
    try {
      this.reminder.set(await this.api.reminder(family.id, this.reminderId()));
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(problem.status === 404 ? 'We couldn’t find that reminder. It may have been deleted.' : generalMessage(problem));
    }
  }
}
