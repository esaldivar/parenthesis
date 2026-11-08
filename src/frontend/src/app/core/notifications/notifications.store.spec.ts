import { TestBed } from '@angular/core/testing';
import { Api } from '../api/api';
import { fakeAuth } from '../../../testing/fake-auth';
import { NotificationsStore } from './notifications.store';

// Synthetic family only; the server is faked.
describe('NotificationsStore (#178)', () => {
  function create(notificationsUnseen: ReturnType<typeof vi.fn>, options: Parameters<typeof fakeAuth>[0] = {}) {
    TestBed.configureTestingModule({ providers: [fakeAuth(options), { provide: Api, useValue: { notificationsUnseen } }] });
    const store = TestBed.inject(NotificationsStore);
    TestBed.tick();
    return store;
  }

  it('shows the dot when the parent has unseen notifications', async () => {
    const unseen = vi.fn(async () => ({ unseen: true }));
    const store = create(unseen);

    await vi.waitFor(() => expect(store.unseen()).toBe(true));
    expect(unseen).toHaveBeenCalledWith('family-1');
  });

  it('keeps the dot when a refresh fails', async () => {
    const unseen = vi.fn(async () => ({ unseen: true }));
    const store = create(unseen);
    await vi.waitFor(() => expect(store.unseen()).toBe(true));

    unseen.mockRejectedValueOnce(new Error('offline'));
    await store.refresh();

    expect(store.unseen()).toBe(true);
  });

  it('ignores an answer that arrives after a newer refresh', async () => {
    let answerFirst: (value: { unseen: boolean }) => void = () => undefined;
    const unseen = vi.fn(async () => ({ unseen: false }));
    const store = create(unseen);
    await vi.waitFor(() => expect(unseen).toHaveBeenCalledTimes(1));

    unseen.mockImplementationOnce(() => new Promise((resolve) => (answerFirst = resolve)));
    const first = store.refresh();
    unseen.mockResolvedValueOnce({ unseen: false });
    await store.refresh();
    answerFirst({ unseen: true });
    await first;

    expect(store.unseen()).toBe(false);
  });

  it('never asks for a child’s family', async () => {
    const unseen = vi.fn();
    const store = create(unseen, {
      families: [{ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', role: 'Child' }],
    });
    await store.refresh();

    expect(unseen).not.toHaveBeenCalled();
    expect(store.unseen()).toBe(false);
  });
});
