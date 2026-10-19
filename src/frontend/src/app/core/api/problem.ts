import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 9457 problem response from the API, reduced to what the UI needs. */
export interface Problem {
  readonly status: number;
  readonly title?: string;
  /** The API's second line, for example "2 tries left." or "Ask Mom or Dad to unlock it." */
  readonly detail?: string;
  /** The problem type URI, when the API sets one (for example `…/existing-family`). */
  readonly type?: string;
  /** Field errors from a validation problem, keyed by the request's field names. */
  readonly errors: Readonly<Record<string, readonly string[]>>;
  /** A wrong child PIN: how many tries are left before the profile locks. */
  readonly triesLeft?: number;
}

export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, errors: {} };
  }
  const body = typeof error.error === 'object' && error.error !== null ? error.error : {};
  return {
    status: error.status,
    title: typeof body.title === 'string' ? body.title : undefined,
    detail: typeof body.detail === 'string' ? body.detail : undefined,
    type: typeof body.type === 'string' ? body.type : undefined,
    errors: typeof body.errors === 'object' && body.errors !== null ? body.errors : {},
    triesLeft: typeof body.triesLeft === 'number' ? body.triesLeft : undefined,
  };
}

/** A friendly sentence for failures that aren't about a particular field. */
export function generalMessage(problem: Problem): string {
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
