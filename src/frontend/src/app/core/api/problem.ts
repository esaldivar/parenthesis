import { HttpErrorResponse } from '@angular/common/http';

import { AppLocale } from '../i18n/locale.service';

const responseLocales = new WeakMap<HttpErrorResponse, AppLocale>();

export function rememberProblemLocale(error: unknown, locale: AppLocale): void {
  if (error instanceof HttpErrorResponse) responseLocales.set(error, locale);
}

const spanishErrors = new Map([
  ['Invalid email or password.', 'El correo electrónico o la contraseña no son correctos.'],
  ['Enter a valid email address.', 'Ingresa un correo electrónico válido.'],
  ['Enter a password.', 'Ingresa una contraseña.'],
  ['This link is invalid or has expired.', 'Este enlace no es válido o venció.'],
  ['Choose English or Spanish.', 'Elige inglés o español.'],
  ['Could not save your language preference.', 'No se pudo guardar tu idioma.'],
  ['One or more validation errors occurred.', 'Revisa los campos indicados.'],
]);

/** An RFC 9457 problem response from the API, reduced to what the UI needs. */
export interface Problem {
  readonly status: number;
  readonly locale?: AppLocale;
  readonly title?: string;
  /** The API's second line, for example "2 tries left." or "Ask Mom or Dad to unlock it." */
  readonly detail?: string;
  /** The problem type URI, when the API sets one (for example `…/existing-family`). */
  readonly type?: string;
  /** Field errors from a validation problem, keyed by the request's field names. */
  readonly errors: Readonly<Record<string, readonly string[]>>;
  /** A wrong PIN: how many tries are left before it pauses or locks. */
  readonly triesLeft?: number;
  /** A PIN that can't be tried right now (#153): paused for a while, locked until reset, or not set up. */
  readonly state?: 'paused' | 'locked' | 'no-pin';
  /** When a paused PIN can be tried again (ISO time). The server decides; the page only shows it. */
  readonly retryAt?: string;
  /** Present when this request tried to email someone: true only if the mail server accepted it. */
  readonly notified?: boolean;
  /** A short code for why the server refused, when it gives one (for example event photos' "storage-full"). */
  readonly reason?: string;
}

export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, errors: {} };
  }
  const body = typeof error.error === 'object' && error.error !== null ? error.error : {};
  const spanish = responseLocales.get(error) === 'es-419';
  const localized = (message: string) => spanish ? (spanishErrors.get(message) ?? message) : message;
  const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, unknown> : {};
  return {
    status: error.status,
    ...(spanish ? { locale: 'es-419' as const } : {}),
    title: typeof body.title === 'string' ? localized(body.title) : undefined,
    detail: typeof body.detail === 'string' ? localized(body.detail) : undefined,
    type: typeof body.type === 'string' ? body.type : undefined,
    errors: Object.fromEntries(Object.entries(errors).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string').map(localized) : [],
    ])),
    triesLeft: typeof body.triesLeft === 'number' ? body.triesLeft : undefined,
    state: body.state === 'paused' || body.state === 'locked' || body.state === 'no-pin' ? body.state : undefined,
    retryAt: typeof body.retryAt === 'string' ? body.retryAt : undefined,
    notified: typeof body.notified === 'boolean' ? body.notified : undefined,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  };
}

/** A friendly sentence for failures that aren't about a particular field. */
export function generalMessage(problem: Problem): string {
  if (problem.locale === 'es-419') {
    if (problem.status === 0) return 'No pudimos conectarnos con Parenthesis. Revisa tu conexión e inténtalo de nuevo.';
    if (problem.status === 429) return 'Hubo demasiados intentos. Espera un minuto y vuelve a intentarlo.';
    if (problem.status >= 500) return 'Algo salió mal de nuestro lado. Inténtalo de nuevo.';
    return problem.title ?? 'No funcionó. Inténtalo de nuevo.';
  }
  switch (problem.status) {
    case 0:
      return 'We couldn’t reach Parenthesis. Check your connection and try again.';
    case 429:
      return 'Too many attempts. Please wait a minute and try again.';
    default:
      return problem.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : (problem.title ?? 'That didn’t work. Please try again.');
  }
}
