import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { Api, Child, SharedTask, TaskInput } from '../../core/api/api';
import { generalMessage, toProblem } from '../../core/api/problem';
import { AuthStore } from '../../core/auth/auth.store';
import { Icon } from '../../shared/icon/icon';
import { FORM_STYLES } from '../auth/form-styles';
import { PlainDate } from '../dashboard/model';
import { todayIn } from '../dashboard/week';
import { revealFirstProblem } from './reveal-problem';

export const TASK_TITLE_MAX = 80;
export const TASK_DETAILS_MAX = 1000;
export const ITEM_TEXT_MAX = 120;
export const ITEMS_MAX = 50;

type ItemGroup = FormGroup<{ id: FormControl<string>; text: FormControl<string>; required: FormControl<boolean> }>;

/**
 * Add or edit a shared task (#73, part 4: #177). Title, due date, an optional child and details, and an optional
 * checklist whose items can be added, removed and reordered, each required or optional. Saved at once for both
 * parents, with no approval. There's no assignee, attachment or task-level "complete" control: the checklist decides
 * (or Mark done, in the details, when there's no checklist). An edit sends the version it was made from; if the
 * other parent changed the task first, nothing is overwritten and the form offers their latest version.
 */
@Component({
  selector: 'app-task-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, Icon],
  templateUrl: './task-form.html',
  styleUrls: ['./add-event-page.scss', './task-form.scss'],
  styles: [FORM_STYLES],
})
export class TaskForm implements OnInit {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly announcer = inject(LiveAnnouncer);

  /** The due date to start on when adding. */
  readonly date = input<PlainDate | null>(null);
  /** Editing: the task as last loaded. */
  readonly task = input<SharedTask | null>(null);

  protected readonly titleMax = TASK_TITLE_MAX;
  protected readonly detailsMax = TASK_DETAILS_MAX;
  protected readonly itemMax = ITEM_TEXT_MAX;
  protected readonly itemsMax = ITEMS_MAX;
  private readonly family = this.auth.currentFamily;
  private readonly timeZone = computed(() => this.family()?.timeZone ?? 'UTC');

  protected readonly children = signal<readonly Child[]>([]);
  protected readonly activeChildren = computed(() => this.children().filter((c) => c.status === 'Active'));
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly conflict = signal(false);
  protected readonly fieldErrors = signal<Readonly<Record<string, string>>>({});
  /** The version this edit is based on; replaced when the parent loads the other parent's latest. */
  private readonly version = signal<number | null>(null);
  protected readonly editing = computed(() => this.task() !== null);

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(TASK_TITLE_MAX)]],
    dueDate: ['', Validators.required],
    childId: [''],
    details: ['', Validators.maxLength(TASK_DETAILS_MAX)],
    items: this.fb.array<ItemGroup>([]),
  });
  protected get items(): FormArray<ItemGroup> {
    return this.form.controls.items;
  }

  async ngOnInit(): Promise<void> {
    const task = this.task();
    if (task) {
      this.fill(task);
    } else {
      this.form.patchValue({ dueDate: this.date() ?? todayIn(this.timeZone(), new Date()) });
    }
    const family = this.family();
    if (family) {
      try {
        this.children.set(await this.api.children(family.id));
      } catch {
        // The child list is optional; the task can still be saved without one.
      }
    }
  }

  protected addItem(): void {
    if (this.items.length >= ITEMS_MAX) {
      return;
    }
    this.items.push(this.item('', '', true));
    const index = this.items.length - 1;
    afterNextRender(() => this.focusItem(index), { injector: this.injector });
  }

  protected removeItem(index: number): void {
    const text = this.items.at(index).controls.text.value.trim() || 'Item';
    this.items.removeAt(index);
    void this.announcer.announce(`${text} removed from the checklist.`);
    // Keep the keyboard on the list: the next item, or the Add item button when it was the last.
    afterNextRender(() => (this.items.length > 0 ? this.focusItem(Math.min(index, this.items.length - 1)) : this.focusAdd()), {
      injector: this.injector,
    });
  }

  protected moveItem(index: number, by: -1 | 1): void {
    const to = index + by;
    if (to < 0 || to >= this.items.length) {
      return;
    }
    const moving = this.items.at(index);
    this.items.removeAt(index);
    this.items.insert(to, moving);
    const text = moving.controls.text.value.trim() || 'Item';
    void this.announcer.announce(`${text} moved to position ${to + 1} of ${this.items.length}.`);
    afterNextRender(() => this.focusMove(to, by), { injector: this.injector });
  }

  protected itemLabel(index: number): string {
    return this.items.at(index).controls.text.value.trim() || `item ${index + 1}`;
  }

  protected fieldError(name: string): string | null {
    return this.fieldErrors()[name] ?? null;
  }

  /** After a conflict: replace the form with the other parent's latest version. */
  protected async loadLatest(): Promise<void> {
    const family = this.family();
    const task = this.task();
    if (!family || !task) {
      return;
    }
    try {
      this.fill(await this.api.task(family.id, task.id));
      this.conflict.set(false);
      this.error.set(null);
      void this.announcer.announce('Loaded the latest version of this task.');
    } catch (error) {
      this.error.set(generalMessage(toProblem(error)));
    }
  }

  /** Shows the first problem after a refused save (see revealFirstProblem). */
  private revealProblem(): void {
    afterNextRender(() => revealFirstProblem(this.host.nativeElement), { injector: this.injector });
  }

  protected async submit(): Promise<void> {
    const family = this.family();
    if (!family || this.busy()) {
      return;
    }
    const errors = this.validate();
    this.fieldErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.form.markAllAsTouched();
      this.revealProblem();
      return;
    }

    this.busy.set(true);
    this.error.set(null);
    this.conflict.set(false);
    try {
      const existing = this.task();
      const saved = existing
        ? await this.api.updateTask(family.id, existing.id, this.request())
        : await this.api.createTask(family.id, this.request());
      await this.router.navigate(['/calendar'], {
        queryParams: { date: saved.dueDate },
        state: { calendarNotice: existing ? `“${saved.title}” was updated.` : `“${saved.title}” is on the calendar.` },
      });
    } catch (error) {
      const problem = toProblem(error);
      const serverErrors = Object.fromEntries(Object.entries(problem.errors).map(([k, v]) => [k, v.join(' ')]));
      if (problem.status === 409) {
        this.conflict.set(true);
      } else if (problem.status === 400 && Object.keys(serverErrors).length > 0) {
        this.fieldErrors.set(serverErrors);
      } else {
        this.error.set(generalMessage(problem));
      }
      this.revealProblem();
    } finally {
      this.busy.set(false);
    }
  }

  private fill(task: SharedTask): void {
    this.version.set(task.version);
    this.items.clear();
    for (const i of task.items) {
      this.items.push(this.item(i.id, i.text, i.required));
    }
    this.form.patchValue({ title: task.title, dueDate: task.dueDate, childId: task.childId ?? '', details: task.details ?? '' });
  }

  private item(id: string, text: string, required: boolean): ItemGroup {
    return this.fb.group({ id: [id], text: [text], required: [required] });
  }

  private validate(): Record<string, string> {
    const v = this.form.getRawValue();
    const errors: Record<string, string> = {};
    if (!v.title.trim()) {
      errors['title'] = 'Enter a title.';
    } else if (v.title.trim().length > TASK_TITLE_MAX) {
      errors['title'] = `Keep the title to ${TASK_TITLE_MAX} characters.`;
    }
    if (!v.dueDate) {
      errors['dueDate'] = 'Choose the day it’s due.';
    }
    if (v.items.some((i) => !i.text.trim() || i.text.trim().length > ITEM_TEXT_MAX)) {
      errors['items'] = `Give each checklist item 1 to ${ITEM_TEXT_MAX} characters, or remove it.`;
    }
    return errors;
  }

  private request(): TaskInput {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      dueDate: v.dueDate,
      childId: v.childId || null,
      details: v.details.trim() || undefined,
      items: v.items.map((i) => ({ ...(i.id ? { id: i.id } : {}), text: i.text.trim(), required: i.required })),
      ...(this.editing() ? { version: this.version() ?? undefined } : {}),
    };
  }

  private focusItem(index: number): void {
    this.host.nativeElement.querySelectorAll<HTMLInputElement>('.item input[type="text"]')[index]?.focus();
  }

  private focusAdd(): void {
    this.host.nativeElement.querySelector<HTMLButtonElement>('.add-item')?.focus();
  }

  /** Keep focus on the move button that was pressed, or its partner when the item reached an end. */
  private focusMove(index: number, by: -1 | 1): void {
    const row = this.host.nativeElement.querySelectorAll<HTMLElement>('.item')[index];
    const wanted = row?.querySelector<HTMLButtonElement>(by === -1 ? '.move-up' : '.move-down');
    (wanted && !wanted.disabled ? wanted : row?.querySelector<HTMLButtonElement>(by === -1 ? '.move-down' : '.move-up'))?.focus();
  }

  /** Where Cancel goes: the day being edited or added. */
  protected readonly back = computed(() => this.task()?.dueDate ?? this.date() ?? todayIn(this.timeZone(), new Date()));
}
