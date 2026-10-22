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
  imports: [RouterLink, TaskForm],
  template: `
    <p class="back"><a routerLink="/calendar">← Calendar</a></p>
    <h1>Edit task</h1>
    @if (task(); as task) {
      <app-task-form [task]="task" />
    } @else if (error(); as message) {
      <div class="alert" role="alert">{{ message }}</div>
    } @else {
      <p role="status">Loading…</p>
    }
  `,
  styleUrl: './add-event-page.scss',
  styles: [FORM_STYLES],
})
export class TaskEditPage implements OnInit {
  private readonly api = inject(Api);
  private readonly family = inject(AuthStore).currentFamily;

  /** The `:taskId` route parameter. */
  readonly taskId = input.required<string>();

  protected readonly task = signal<SharedTask | null>(null);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const family = this.family();
    if (!family) {
      return;
    }
    try {
      this.task.set(await this.api.task(family.id, this.taskId()));
    } catch (error) {
      const problem = toProblem(error);
      this.error.set(problem.status === 404 ? 'We couldn’t find that task. It may have been deleted.' : generalMessage(problem));
    }
  }
}
