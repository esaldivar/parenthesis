import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { event } from '../../../testing/calendar-fixtures';
import { CALENDAR_CACHE_MAX_AGE_MS, CALENDAR_CACHE_SIZE, CalendarCache, clearCalendarCacheOnWrite } from './calendar-cache';

/** Synthetic data only. */
const PERIOD = { events: [event({ id: 'practice' })], reminders: [], tasks: [] };

describe('CalendarCache (#415)', () => {
  let cache: CalendarCache;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([clearCalendarCacheOnWrite])), provideHttpClientTesting()],
    });
    cache = TestBed.inject(CalendarCache);
  });

  it('keeps nothing until someone is signed in', () => {
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());
    expect(cache.get('family-1', '2026-11-01', '2026-11-08')).toBeNull();
  });

  it('returns a period for the same viewer, family and range only', () => {
    cache.useViewer('user:alex');
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());

    expect(cache.get('family-1', '2026-11-01', '2026-11-08')?.events[0].id).toBe('practice');
    expect(cache.get('family-2', '2026-11-01', '2026-11-08')).toBeNull();
    expect(cache.get('family-1', '2026-11-08', '2026-11-15')).toBeNull();
  });

  it('forgets everything when the viewer changes or signs out, so nobody sees a previous user’s family', () => {
    cache.useViewer('user:alex');
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());

    cache.useViewer('user:jordan');
    expect(cache.size).toBe(0);
    expect(cache.get('family-1', '2026-11-01', '2026-11-08')).toBeNull();

    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());
    cache.useViewer(null);
    expect(cache.size).toBe(0);

    cache.useViewer('child:kai');
    expect(cache.get('family-1', '2026-11-01', '2026-11-08')).toBeNull();
  });

  it('drops a period after ten minutes', () => {
    cache.useViewer('user:alex');
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp(), 1_000);

    expect(cache.get('family-1', '2026-11-01', '2026-11-08', 1_000 + CALENDAR_CACHE_MAX_AGE_MS)).not.toBeNull();
    expect(cache.get('family-1', '2026-11-01', '2026-11-08', 1_001 + CALENDAR_CACHE_MAX_AGE_MS)).toBeNull();
  });

  it('keeps only the most recent periods', () => {
    cache.useViewer('user:alex');
    for (let week = 0; week <= CALENDAR_CACHE_SIZE; week++) {
      cache.set('family-1', `w${week}`, `w${week + 1}`, PERIOD, cache.stamp());
    }

    expect(cache.size).toBe(CALENDAR_CACHE_SIZE);
    expect(cache.get('family-1', 'w0', 'w1')).toBeNull();
    expect(cache.get('family-1', `w${CALENDAR_CACHE_SIZE}`, `w${CALENDAR_CACHE_SIZE + 1}`)).not.toBeNull();
  });

  it('ignores an answer that was fetched before the cache was last cleared', () => {
    cache.useViewer('user:alex');
    const stamp = cache.stamp();
    cache.clear();
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, stamp);

    expect(cache.get('family-1', '2026-11-01', '2026-11-08')).toBeNull();
  });

  it('is cleared by every change sent to the server, when it is sent and when it finishes, but not by reads', async () => {
    const http = TestBed.inject(HttpClient);
    const backend = TestBed.inject(HttpTestingController);
    cache.useViewer('user:alex');
    cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());

    const read = firstValueFrom(http.get('/api/families/family-1/calendar/events'));
    backend.expectOne('/api/families/family-1/calendar/events').flush([]);
    await read;
    expect(cache.size).toBe(1);

    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());
      const write = firstValueFrom(http.request(method, '/api/families/family-1/calendar/events/e1', { body: {} }));
      expect(cache.size).toBe(0);
      // A read that finished while the change was in flight is not kept.
      cache.set('family-1', '2026-11-01', '2026-11-08', PERIOD, cache.stamp());
      backend.expectOne('/api/families/family-1/calendar/events/e1').flush({});
      await write;
      expect(cache.size).toBe(0);
    }
    backend.verify();
  });
});
