import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe, translate } from '../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, SharedTask } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { FORM_STYLES } from '../auth/form-styles';
import { TaskForm } from './task-form';

/** Edit a task and its checklist (#177): at once, with no approval. */
@Component({
  selector: 'app-task-edit-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, RouterLink, TaskForm],
  template: `
    <p class="back"><a routerLink="/calendar">{{ 'feature.calendar' | tr }}</a></p>
    <h1>{{ 'feature.edit.task' | tr }}</h1>
    @if (task(); as task) {
      <app-task-form [task]="task" />
    } @else if (error(); as message) {
      <div class="alert" role="alert">{{ message }}</div>
    } @else {
      <p role="status">{{ 'feature.loading' | tr }}</p>
    }
  `,
  styleUrl: './add-event-page.scss',
  styles: [FORM_STYLES],
})
export class TaskEditPage implements OnInit {
  private readonly copyLocale = inject(LocaleService);
  private readonly api = inject(Api);
  private readonly family = inject(AuthStore).currentFamily;

  /** The `:taskId` route parameter. */
  readonly taskId = input.required<string>();

  protected readonly task = signal<SharedTask | null>(null);
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
      this.task.set(await this.api.task(family.id, this.taskId()));
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(problem.status === 404 ? translate('calendar.task.missing', this.copyLocale.locale()) : generalMessage(problem));
    }
  }
}
