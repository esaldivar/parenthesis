import { TestBed } from '@angular/core/testing';
import { Api, ChangeRequest } from '../../core/api/api';
import { fakeAuth } from '../../../testing/fake-auth';
import { ApprovalsPage } from './approvals-page';

// Synthetic family only. The API is faked: the page's own focus handling is what's under test.
const request = (overrides: Partial<ChangeRequest> = {}): ChangeRequest => ({
  id: 'request-1',
  type: 'CalendarCreate',
  targetType: 'calendar_event',
  targetId: 'event-1',
  summary: 'Pending school meeting',
  reason: null,
  status: 'Pending',
  proposerMembershipId: 'm-sam',
  createdAt: '2026-10-01T12:00:00Z',
  approvals: 1,
  requiredApprovals: 2,
  canDecide: true,
  proposedByYou: false,
  resolvedAt: null,
  decisions: [],
  ...overrides,
});

describe('approvals focus after Cancel and decisions (#279)', () => {
  let pending: ChangeRequest[];

  async function render() {
    const api = {
      approvals: vi.fn(async (_family: string, which?: string) => (which === 'history' ? [] : pending)),
      family: vi.fn(async () => ({ id: 'family-1', name: 'Rivera Family', timeZone: 'America/Chicago', createdAt: '', members: [] })),
      children: vi.fn(async () => []),
      approve: vi.fn(async () => {
        pending = [];
      }),
      reject: vi.fn(async () => {
        pending = [];
      }),
      withdraw: vi.fn(async () => {
        pending = [];
      }),
    };
    TestBed.configureTestingModule({ providers: [fakeAuth(), { provide: Api, useValue: api }] });
    const fixture = TestBed.createComponent(ApprovalsPage);
    document.body.appendChild(fixture.nativeElement);
    await settle(fixture);
    return { fixture, api, page: fixture.nativeElement as HTMLElement };
  }

  async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }) {
    for (let i = 0; i < 4; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  /** The decision reloads the list asynchronously; wait for that render and the focus move after it. */
  async function focused(fixture: { detectChanges(): void }, page: HTMLElement) {
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(document.activeElement).toBe(page.querySelector('#waiting-heading'));
    });
  }

  const button = (within: HTMLElement, label: string) => {
    const match = [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === label);
    if (!match) {
      throw new Error(`No button "${label}"`);
    }
    return match;
  };

  beforeEach(() => {
    pending = [request()];
  });

  it('returns focus to the item’s Decline button when the decline form is cancelled', async () => {
    const { fixture, page } = await render();
    const decline = button(page, 'Decline');
    decline.focus();
    decline.click();
    await settle(fixture);
    expect(page.querySelector('textarea')).not.toBeNull();

    const cancel = button(page, 'Cancel');
    cancel.focus();
    cancel.click();
    await settle(fixture);

    expect(page.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button(page, 'Decline'));
    expect(document.activeElement).not.toBe(document.body);
  });

  for (const [label, action] of [
    ['Approve', 'approve'],
    ['Decline', 'reject'],
  ] as const) {
    it(`moves focus to the Waiting heading after ${label}, since the item leaves the list`, async () => {
      const { fixture, page, api } = await render();
      if (label === 'Decline') {
        button(page, 'Decline').click();
        await settle(fixture);
      }
      const decide = button(page, label);
      decide.focus();
      decide.click();
      await settle(fixture);

      expect(api[action]).toHaveBeenCalled();
      await focused(fixture, page);
      expect(page.textContent).toContain('Nothing is waiting for either of you.');
    });
  }

  it('moves focus to the Waiting heading after Withdraw', async () => {
    pending = [request({ canDecide: false, proposedByYou: true, proposerMembershipId: 'm-alex' })];
    const { fixture, page, api } = await render();
    const withdraw = button(page, 'Withdraw');
    withdraw.focus();
    withdraw.click();
    await settle(fixture);

    expect(api.withdraw).toHaveBeenCalled();
    await focused(fixture, page);
  });
});
