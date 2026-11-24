import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { Feedback } from './feedback';
import { FeedbackDialog } from './feedback-dialog';

describe('Feedback opener (#738)', () => {
  let dialog: { getDialogById: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> };
  let feedback: Feedback;

  beforeEach(() => {
    dialog = { getDialogById: vi.fn().mockReturnValue(undefined), open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Dialog, useValue: dialog },
        provideRouter([{ path: 'calendar', children: [] }]),
      ],
    });
    feedback = TestBed.inject(Feedback);
  });

  afterEach(() => {
    document.querySelectorAll('.feedback-test').forEach((el) => el.remove());
  });

  it('opens the dialog once with the current screen and an accessible heading', async () => {
    await TestBed.inject(Router).navigateByUrl('/calendar');
    feedback.open();
    expect(dialog.open).toHaveBeenCalledOnce();
    expect(dialog.open).toHaveBeenCalledWith(
      FeedbackDialog,
      expect.objectContaining({ id: 'parenthesis-feedback', data: 'calendar', ariaLabelledBy: 'feedback-heading', ariaModal: true }),
    );
  });

  it('falls back to home when no screen is in the route', () => {
    feedback.open();
    expect(dialog.open.mock.calls[0][1]).toEqual(expect.objectContaining({ data: 'home' }));
  });

  it('does not open a second dialog while one is already open', () => {
    dialog.getDialogById.mockReturnValue({});
    feedback.open();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('returns focus to the account button when opened from the account menu', () => {
    const topbar = document.createElement('div');
    topbar.className = 'feedback-test topbar';
    topbar.innerHTML = '<button class="account" type="button">Account</button>';
    const menu = document.createElement('div');
    menu.className = 'feedback-test';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<button type="button">Feedback</button>';
    document.body.append(topbar, menu);
    menu.querySelector('button')!.focus();

    feedback.open();

    expect(dialog.open.mock.calls[0][1]).toEqual(expect.objectContaining({ restoreFocus: topbar.querySelector('.account') }));
  });

  it('returns focus to the control that opened it otherwise', () => {
    const button = document.createElement('button');
    button.className = 'feedback-test';
    document.body.append(button);
    button.focus();

    feedback.open();

    expect(dialog.open.mock.calls[0][1]).toEqual(expect.objectContaining({ restoreFocus: button }));
  });
});
