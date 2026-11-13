import { ChatEventCard } from '../../core/api/api';
import { cardStatus, cardWhen } from './event-card';

// Synthetic event only.
const card = (overrides: Partial<ChatEventCard> = {}): ChatEventCard => ({
  id: 'event-1',
  available: true,
  title: 'Soccer practice',
  startsAt: '2026-10-31T15:30:00Z',
  endsAt: '2026-10-31T16:30:00Z',
  allDay: false,
  status: 'Confirmed',
  changePending: false,
  ...overrides,
});

describe('chat event card text (#125, #534)', () => {
  const zone = 'America/Chicago';

  it('reads in English by default', () => {
    expect(cardWhen(card(), zone)).toBe('Sat, Oct 31, 10:30 AM');
    expect(cardWhen(card({ allDay: true, startsAt: '2026-10-31T05:00:00Z' }), zone)).toBe('Sat, Oct 31 · All day');
    expect(cardStatus(card({ status: 'Proposed' }))).toBe('Pending approval');
    expect(cardStatus(card({ status: 'Declined' }))).toBe('Declined');
    expect(cardStatus(card({ changePending: true }))).toBe('Change pending');
    expect(cardStatus(card())).toBeNull();
  });

  it('reads in Spanish when the parent chose it', () => {
    expect(cardWhen(card(), zone, 'es-419')).toBe('sáb, 31 oct, 10:30 a.m.');
    expect(cardWhen(card({ allDay: true, startsAt: '2026-10-31T05:00:00Z' }), zone, 'es-419')).toBe(
      'sáb, 31 oct · Todo el día',
    );
    expect(cardStatus(card({ status: 'Proposed' }), 'es-419')).toBe('Pendiente de aprobación');
    expect(cardStatus(card({ status: 'Declined' }), 'es-419')).toBe('Rechazado');
    expect(cardStatus(card({ changePending: true }), 'es-419')).toBe('Cambio pendiente');
  });
});
