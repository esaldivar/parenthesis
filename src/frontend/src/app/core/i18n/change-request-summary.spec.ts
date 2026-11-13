import { localizeSummary } from './change-request-summary';
import { localDateFormat } from './locale-formatting';

describe('localizeSummary (#534)', () => {
  const es = (type: string, summary: string, targetType = 'calendar_event') =>
    localizeSummary({ type, targetType, summary }, 'es-419');

  it('keeps English summaries as stored', () => {
    expect(localizeSummary({ type: 'CalendarModify', targetType: 'calendar_event', summary: 'Change Soccer' }, 'en'))
      .toBe('Change Soccer');
  });

  it('rebuilds each known summary in Spanish around the family’s own titles and names', () => {
    expect(es('ChildCreate', 'Add Sam to the family', 'child')).toBe('Agregar a Sam a la familia');
    expect(es('CalendarModify', 'Change Soccer: practice, Tue')).toBe('Cambiar Soccer: practice, Tue');
    expect(es('CalendarCancel', 'Cancel Time with Dad')).toBe('Cancelar Time with Dad');
    expect(es('SharedFundProposal', 'Shared Fund proposal', 'SharedFund')).toBe('Propuesta de fondo compartido');
    expect(es('CalendarCreate', 'Add: Swim, lessons, Nov 12')).toMatch(/^Agregar: Swim, lessons, 12 nov\.?$/);
    expect(es('JointEventCreate', 'Family event: Dinner, Dec 4')).toMatch(/^Evento familiar: Dinner, 4 dic\.?$/);
  });

  it('rebuilds a repeating request with its days and dates in Spanish', () => {
    const weekly = es('CalendarCreate', 'Add: Time with Dad, every 2 weeks on Fri, Sat and Sun, 10 dates: Dec 14, Dec 28, Jan 11 … Apr 19', 'calendar_series');
    expect(weekly).toMatch(/^Agregar: Time with Dad, cada 2 semanas: vie\.?, sáb\.? y dom\.?, 10 fechas: 14 dic\.?, 28 dic\.?, 11 ene\.? … 19 abr\.?$/);
    expect(es('CalendarCreate', 'Add: Piano, every day, 3 dates: Nov 2, Nov 3, Nov 4', 'calendar_series'))
      .toMatch(/^Agregar: Piano, todos los días, 3 fechas: 2 nov\.?, 3 nov\.?, 4 nov\.?$/);
    expect(es('CalendarCreate', 'Add: Rent check, every month on the 3rd, 2 dates: Dec 3, Jan 3', 'calendar_series'))
      .toMatch(/^Agregar: Rent check, cada mes el día 3, 2 fechas: 3 dic\.?, 3 ene\.?$/);
  });

  it('shows anything it doesn’t recognise as stored, such as a summary cut short', () => {
    const cut = 'Add: Time with Dad, every 2 weeks on Fri, Sat and Sun, 10 dates: Dec 14, Dec 2…';
    expect(es('CalendarCreate', cut, 'calendar_series')).toBe(cut);
    expect(es('SomethingNew', 'Do something')).toBe('Do something');
  });
});

describe('localDateFormat (#534)', () => {
  it('writes fixed month-first patterns day-first in Spanish only', () => {
    expect(localDateFormat('MMM d', 'es-419')).toBe('d MMM');
    expect(localDateFormat('MMM d, h:mm a', 'es-419')).toBe('d MMM, h:mm a');
    expect(localDateFormat('MMM d, h:mm a', 'en')).toBe('MMM d, h:mm a');
    expect(localDateFormat('mediumDate', 'es-419')).toBe('mediumDate');
    expect(localDateFormat(undefined, 'es-419')).toBeUndefined();
  });
});
