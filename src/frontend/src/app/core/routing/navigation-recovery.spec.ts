import { A11yModule } from '@angular/cdk/a11y';
import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NavigationError, Router, RouterLink, provideRouter, withNavigationErrorHandler, withRouterConfig } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NavigationRecovery } from './navigation-recovery';

@Component({
  imports: [RouterLink, A11yModule],
  template: `<section cdkTrapFocus [cdkTrapFocusAutoCapture]="true">
    <input aria-label="Draft" value="Unsaved note" /><a routerLink="/edit">Edit task</a>
  </section>`,
})
class CurrentPage {}

describe('Failed lazy-page navigation recovery (#177)', () => {
  async function open(message = 'Failed to fetch dynamically imported module: /chunk-old.js') {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [{ path: '', component: CurrentPage }, { path: 'edit', loadComponent: () => Promise.reject(new TypeError(message)) }],
          withNavigationErrorHandler((event) => TestBed.inject(NavigationRecovery).handle(event)),
          withRouterConfig({ resolveNavigationPromiseOnError: true }),
        ),
      ],
    });
    const harness = await RouterTestingHarness.create('/');
    const recovery = TestBed.inject(NavigationRecovery);
    const reload = vi.spyOn(recovery, 'reload').mockImplementation(() => undefined);
    const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>('a')!;
    link.focus();
    await TestBed.inject(Router).navigateByUrl('/edit');
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
    return { harness, recovery, reload, link };
  }

  it('explains a failed import, preserves the current page and draft, and never auto-reloads', async () => {
    const { harness, reload, link } = await open();
    const dialog = document.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('This page couldn’t load');
    expect(dialog.textContent).toContain('discard any unsaved changes');
    expect(harness.routeNativeElement!.querySelector('input')!.value).toBe('Unsaved note');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(reload).not.toHaveBeenCalled();
    const keep = dialog.querySelector<HTMLButtonElement>('.keep-working')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(keep));
    keep.click();
    await harness.fixture.whenStable();
    await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
    await vi.waitFor(() => expect(document.activeElement).toBe(link));
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads only when the user chooses Reload Parenthesis', async () => {
    const { reload } = await open();
    const button = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')]
      .find((el) => el.textContent?.includes('Reload Parenthesis'))!;
    button.click();
    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([
    'error loading dynamically imported module: /chunk.js',
    'Importing a module script failed.',
    'Loading chunk 123 failed.',
    'Loading CSS chunk 123 failed.',
  ])('handles browser import errors: %s', async (message) => {
    await open(message);
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });

  it('does not treat unrelated application errors as missing chunks', async () => {
    await open('A resolver returned invalid data');
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  it('does not stack dialogs on repeated failures or expose the failed URL', async () => {
    const { recovery } = await open();
    recovery.handle(new NavigationError(99, '/private?token=secret', new Error('Loading chunk 123 failed.')));
    expect(TestBed.inject(Dialog).openDialogs).toHaveLength(1);
    expect(document.querySelector('[role="alertdialog"]')!.textContent).not.toContain('secret');
  });
});
