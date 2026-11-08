import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, NotificationItem } from '../../core/api/api';
import { NotificationsStore } from '../../core/notifications/notifications.store';
import { fakeAuth } from '../../../testing/fake-auth';
import { NotificationsPage } from './notifications-page';

// Synthetic family only; the server is faked.
const item = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({
  id,
  kind: 'Added',
  createdAt: '2026-11-07T15:00:00Z',
  seen: false,
  eventId: `event-${id}`,
  eventDate: '2026-11-09',
  ...overrides,
});

describe('NotificationsPage (#178)', () => {
  let api: { notifications: ReturnType<typeof vi.fn>; markNotificationsSeen: ReturnType<typeof vi.fn> };
  let refresh: ReturnType<typeof vi.fn>;

  async function render(options: Parameters<typeof fakeAuth>[0] = {}) {
    refresh = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      imports: [NotificationsPage],
      providers: [
        provideRouter([]),
        fakeAuth(options),
        { provide: Api, useValue: api },
        { provide: NotificationsStore, useValue: { refresh } },
      ],
    });
    const fixture = TestBed.createComponent(NotificationsPage);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const text = (fixture: { nativeElement: HTMLElement }) => fixture.nativeElement.textContent ?? '';
  const button = (fixture: { nativeElement: HTMLElement }, label: string) =>
    [...fixture.nativeElement.querySelectorAll('button')].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  beforeEach(() => {
    api = {
      notifications: vi.fn(async () => ({ items: [], hasMore: false })),
      markNotificationsSeen: vi.fn(async () => undefined),
    };
  });

  it('says the parent is all caught up when there is nothing', async () => {
    const fixture = await render();

    expect(text(fixture)).toContain('You’re all caught up');
    expect(api.markNotificationsSeen).not.toHaveBeenCalled();
  });

  it('lists notifications with a link to the event, then marks the unseen ones seen and refreshes the dot', async () => {
    api.notifications.mockResolvedValueOnce({
      items: [item('1'), item('2', { kind: 'Cancelled', seen: true, eventId: null, eventDate: null })],
      hasMore: false,
    });
    const fixture = await render();

    expect(text(fixture)).toContain('Shared calendar event added');
    expect(text(fixture)).toContain('Shared calendar event cancelled');
    const links = fixture.nativeElement.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toContain('event=event-1');
    await vi.waitFor(() => expect(api.markNotificationsSeen).toHaveBeenCalledWith('family-1', ['1']));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('loads older notifications from the next offset without repeating any', async () => {
    api.notifications
      .mockResolvedValueOnce({ items: [item('1', { seen: true }), item('2', { seen: true })], hasMore: true })
      .mockResolvedValueOnce({ items: [item('2', { seen: true }), item('3', { kind: 'Updated', seen: true })], hasMore: false });
    const fixture = await render();

    button(fixture, 'Load older').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.notifications).toHaveBeenLastCalledWith('family-1', 2);
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(3);
    expect(text(fixture)).toContain('Shared calendar event updated');
    expect(button(fixture, 'Load older')).toBeUndefined();
  });

  it('offers Try again when loading fails, and recovers', async () => {
    api.notifications.mockRejectedValueOnce(new Error('offline'));
    const fixture = await render();

    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('couldn’t load');
    expect(text(fixture)).not.toContain('all caught up');
    api.notifications.mockResolvedValueOnce({ items: [item('1', { seen: true })], hasMore: false });
    button(fixture, 'Try again').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(1);
  });

  it('keeps the page when marking seen fails', async () => {
    api.notifications.mockResolvedValueOnce({ items: [item('1')], hasMore: false });
    api.markNotificationsSeen.mockRejectedValueOnce(new Error('offline'));
    const fixture = await render();

    await vi.waitFor(() => expect(api.markNotificationsSeen).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelectorAll('li').length).toBe(1);
  });

  it('reads nothing for a child’s family', async () => {
    await render({ families: [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Child' }] });

    expect(api.notifications).not.toHaveBeenCalled();
  });
});
