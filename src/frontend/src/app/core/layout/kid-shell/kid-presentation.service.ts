import { Injectable, signal } from '@angular/core';

/**
 * How the children's space looks: bigger and simpler, balanced, or compact. The child picks it; it is never
 * inferred from age or gender, and never changes what a child may do (docs/design-system.md). Not saved yet:
 * it resets on reload until profile settings exist.
 */
export type KidPresentation = 'simple' | 'balanced' | 'compact';

@Injectable({ providedIn: 'root' })
export class KidPresentationService {
  readonly presentation = signal<KidPresentation>('balanced');
}
