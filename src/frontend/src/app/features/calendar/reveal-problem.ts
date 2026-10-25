/**
 * After a save is refused, bring the first problem into view and put the keyboard on it, so pressing Save never seems
 * to do nothing: on a phone the message can be far above the button. It's the field's control when there is one (a
 * screen reader then reads the field and its message), otherwise the message itself.
 */
export function revealFirstProblem(root: HTMLElement): void {
  // An invalid date has no message on screen, only red text (#248): its own field is the problem.
  // DateField paints its invalid class during rendering, then restores aria-invalid after Material's own write.
  // Focus must also work in that interval, before the separate ARIA effect has run (#206).
  const problem = root.querySelector<HTMLElement>('.alert, .field-error, input.date-invalid, input[aria-invalid="true"]');
  if (!problem) {
    return;
  }
  const reduced = root.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  problem.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  if (problem.matches('input')) {
    problem.focus({ preventScroll: true });
    return;
  }
  const field = problem.closest('mat-form-field, fieldset');
  const control = field?.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, mat-select, select');
  if (control) {
    control.focus({ preventScroll: true });
    return;
  }
  if (!problem.hasAttribute('tabindex')) {
    problem.setAttribute('tabindex', '-1');
  }
  problem.focus({ preventScroll: true });
}
