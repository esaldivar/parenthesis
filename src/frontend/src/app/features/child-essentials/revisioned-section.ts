import { LocaleService } from '../../core/i18n/locale.service';
import { translate } from '../../core/i18n/translations';
import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Directive, inject, input, signal } from '@angular/core';
import { Api } from '../../core/api/api';

/** A page of a section's history, as every shared section's API returns it. */
export interface RevisionHistoryPage<TEntry> {
  readonly entries: readonly TEntry[];
  readonly beforeRevision: number | null;
}

/**
 * What every shared Child Essentials section with revisions does the same way (#126): edit and save against the
 * revision the parent saw, keep their draft and show the latest saved values when the co-parent saved first, and page
 * through history. Each section supplies its form, its API calls and its own saved message.
 */
@Directive()
export abstract class RevisionedSection<
  TView extends { readonly revision: number },
  TValues,
  TEntry,
> {
  private readonly copyLocale = inject(LocaleService);
  readonly familyId = input.required<string>();
  readonly childId = input.required<string>();
  protected readonly api = inject(Api);
  protected readonly destroyRef = inject(DestroyRef);
  protected readonly current = signal<TView | null>(null);
  protected readonly conflict = signal<TView | null>(null);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly historyOpen = signal(false);
  protected readonly historyLoading = signal(false);
  protected readonly historyError = signal(false);
  protected readonly history = signal<readonly TEntry[]>([]);
  protected readonly nextRevision = signal<number | null>(null);

  protected abstract readonly form: { readonly invalid: boolean; getRawValue(): TValues };
  /** Said once a save works ("Clothing and shoes saved."). */
  protected abstract readonly savedNotice: string;

  protected abstract store(revision: number, values: TValues): Promise<TView>;

  protected abstract historyPage(
    beforeRevision: number | null,
  ): Promise<RevisionHistoryPage<TEntry>>;

  /** The values to save; a section can adjust the form's (School drops a teacher the grade doesn't allow). */
  protected valuesToSave(): TValues {
    return this.form.getRawValue();
  }

  protected cancel(): void {
    if (this.conflict() !== null) {
      this.current.set(this.conflict());
    }
    this.conflict.set(null);
    this.error.set('');
    this.editing.set(false);
  }

  protected async save(): Promise<void> {
    const base = this.conflict() ?? this.current();
    if (!base || this.saving() || this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');
    try {
      const saved = await this.store(base.revision, this.valuesToSave());
      if (this.destroyRef.destroyed) return;
      this.current.set(saved);
      this.conflict.set(null);
      this.editing.set(false);
      this.notice.set(this.savedNotice);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.conflict.set(error.error as TView);
      } else {
        this.error.set(translate('essentials.changes.error', this.copyLocale.locale()));
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected toggleHistory(): void {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) void this.loadHistory(null);
  }

  protected async loadHistory(beforeRevision: number | null): Promise<void> {
    if (this.historyLoading()) return;
    this.historyLoading.set(true);
    this.historyError.set(false);
    if (beforeRevision === null) {
      this.history.set([]);
      this.nextRevision.set(null);
    }
    try {
      const page = await this.historyPage(beforeRevision);
      this.history.update((entries) => [...entries, ...page.entries]);
      this.nextRevision.set(page.beforeRevision);
    } catch {
      this.historyError.set(true);
    } finally {
      this.historyLoading.set(false);
    }
  }
}
