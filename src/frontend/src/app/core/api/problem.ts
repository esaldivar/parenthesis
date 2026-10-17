import { HttpErrorResponse } from '@angular/common/http';

/** An RFC 9457 problem response from the API, reduced to what the UI needs. */
export interface Problem {
  readonly status: number;
  readonly title?: string;
  /** Field errors from a validation problem, keyed by the request's field names. */
  readonly errors: Readonly<Record<string, readonly string[]>>;
}

export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, errors: {} };
  }
  const body = typeof error.error === 'object' && error.error !== null ? error.error : {};
  return {
    status: error.status,
    title: typeof body.title === 'string' ? body.title : undefined,
    errors: typeof body.errors === 'object' && body.errors !== null ? body.errors : {},
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
