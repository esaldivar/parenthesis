/**
 * Shared styles for the auth and onboarding forms. Their form fields use subscriptSizing="dynamic" so two-line
 * hints never overlap the next field on phones.
 */
export const FORM_STYLES = `
  h1 {
    font-size: var(--font-size-h2);
  }
  .lead {
    color: var(--color-text-secondary);
    margin-bottom: var(--space-6);
  }
  form {
    display: grid;
    gap: var(--space-2);
  }
  mat-form-field {
    width: 100%;
  }
  .actions {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }
  .actions button {
    min-height: var(--target-min);
  }
  .alert {
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-control);
    border: 1px solid var(--color-danger);
    color: var(--color-text);
    background: var(--color-status-rejected-bg);
  }
  .status {
    padding: var(--space-3) var(--space-4);
    margin-bottom: var(--space-4);
    border-radius: var(--radius-control);
    border: 1px solid var(--color-outline);
    background: var(--color-status-confirmed-bg);
    color: var(--color-text);
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    margin-top: var(--space-6);
  }
  .links a {
    display: inline-flex;
    align-items: center;
    min-height: var(--target-min);
  }
`;
