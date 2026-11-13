import { localizeMessage } from './problem';
import { END_BEFORE_START, PAST_DATE, TOO_LONG, UNREADABLE_DATE } from '../../features/calendar/date-rules';
import { EMPTY_RANGE } from '../../features/messages/components/chat-transcripts/chat-transcripts.component';

describe('localizeMessage (#534)', () => {
  it('puts client-side calendar validation into Spanish', () => {
    expect(localizeMessage('Enter a title.', 'es-419')).toBe('Ingresa un título.');
    expect(localizeMessage(PAST_DATE, 'es-419')).toBe('Elige una fecha a partir de hoy.');
    expect(localizeMessage(UNREADABLE_DATE, 'es-419')).toContain('mes/día/año');
    expect(localizeMessage(TOO_LONG, 'es-419')).toContain('31 días');
    // The curly apostrophe matches the server's straight one.
    expect(localizeMessage(END_BEFORE_START, 'es-419')).toBe('Elige una hora de finalización posterior al inicio.');
    expect(localizeMessage(EMPTY_RANGE, 'es-419')).toBe('No hay mensajes en este intervalo de fechas.');
  });

  it('leaves English, and messages it doesn’t know, as they are', () => {
    expect(localizeMessage('Enter a title.', 'en')).toBe('Enter a title.');
    expect(localizeMessage('Something only the server says.', 'es-419')).toBe('Something only the server says.');
  });
});
