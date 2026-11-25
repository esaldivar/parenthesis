import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { TranslatePipe } from '../i18n/translations';

type FeedbackType = 'bug' | 'suggestion';

@Component({
  selector: 'app-feedback-dialog',
  imports: [MatButtonModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-dialog.html',
  styleUrl: './feedback-dialog.scss',
})
export class FeedbackDialog {
  protected readonly dialog = inject(DialogRef);
  private readonly http = inject(HttpClient);
  private readonly screen = inject<string>(DIALOG_DATA);
  protected readonly type = signal<FeedbackType | null>(null);
  protected readonly message = signal('');
  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly failed = signal(false);

  private readonly done = viewChild('done', { read: ElementRef });

  constructor() {
    afterRenderEffect(() => this.done()?.nativeElement.focus());
  }

  async send(event: Event): Promise<void> {
    event.preventDefault();
    const type = this.type();
    const message = this.message().trim();
    if (!type || !message || this.sending()) return;
    this.sending.set(true);
    this.failed.set(false);
    this.dialog.disableClose = true;
    try {
      await firstValueFrom(this.http.post<void>('/api/feedback', { type, message, screen: this.screen }));
      this.dialog.updateSize('min(20rem, calc(100vw - 2rem))');
      this.sent.set(true);
    } catch {
      this.failed.set(true);
    } finally {
      this.sending.set(false);
      this.dialog.disableClose = false;
    }
  }
}
