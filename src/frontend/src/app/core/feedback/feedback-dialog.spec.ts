import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FeedbackDialog } from './feedback-dialog';

// Synthetic feedback only.
describe('FeedbackDialog (#738)', () => {
  let fixture: ComponentFixture<FeedbackDialog>;
  let el: HTMLElement;
  let http: HttpTestingController;
  let dialogRef: { close: ReturnType<typeof vi.fn>; updateSize: ReturnType<typeof vi.fn>; disableClose: boolean };

  async function settle() {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  const submit = () => el.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  const submitButton = () => el.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const choose = (value: 'bug' | 'suggestion') => {
    const radio = el.querySelector<HTMLInputElement>(`input[value="${value}"]`)!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
  };
  const write = (text: string) => {
    const textarea = el.querySelector<HTMLTextAreaElement>('#feedback-message')!;
    textarea.value = text;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(async () => {
    dialogRef = { close: vi.fn(), updateSize: vi.fn(), disableClose: false };
    TestBed.configureTestingModule({
      imports: [FeedbackDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DialogRef, useValue: dialogRef },
        { provide: DIALOG_DATA, useValue: 'calendar' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FeedbackDialog);
    el = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => http.verify());

  it('keeps sending disabled until a type and a non-blank message are given', () => {
    expect(submitButton().disabled).toBe(true);
    choose('bug');
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(true);
    write('   ');
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(true);
    submit();
    http.expectNone('/api/feedback');
  });

  it('posts the trimmed message with the type and the screen the user came from', () => {
    choose('suggestion');
    write('  Make the agenda easier to reach  ');
    fixture.detectChanges();
    expect(submitButton().disabled).toBe(false);
    submit();
    const request = http.expectOne('/api/feedback');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ type: 'suggestion', message: 'Make the agenda easier to reach', screen: 'calendar' });
    request.flush(null);
  });

  it('ignores a second submit while the first is still sending', () => {
    choose('bug');
    write('It froze');
    fixture.detectChanges();
    submit();
    submit();
    expect(http.match('/api/feedback')).toHaveLength(1);
    expect(dialogRef.disableClose).toBe(true);
  });

  it('keeps the draft after a failure so the user can retry, then confirms success', async () => {
    choose('bug');
    write('It froze');
    fixture.detectChanges();
    submit();
    http.expectOne('/api/feedback').flush(null, { status: 500, statusText: 'Server Error' });
    await settle();

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(dialogRef.disableClose).toBe(false);
    expect(el.querySelector<HTMLTextAreaElement>('#feedback-message')!.value).toBe('It froze');
    expect(submitButton().disabled).toBe(false);

    submit();
    http.expectOne('/api/feedback').flush(null);
    await settle();

    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(el.querySelector('.feedback-card')?.classList.contains('confirmation')).toBe(true);
    expect(dialogRef.updateSize).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(el.querySelector('.feedback-card button'));
  });
});
