import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, FamilySummary, Me, RecordEntry, SharedFund, SupportRecord } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { SharedRecordsPage } from './shared-records-page';

describe('SharedRecordsPage', () => {
  const fund: SharedFund = {
    id: 'fund-1', approvalId: 'approval-1', title: 'School supplies', currency: 'USD',
    proposerId: 'co-parent', proposerShareMinor: 18000, coParentShareMinor: 12000,
    childIds: ['child-1'], status: 'AwaitingAgreement',
  };

  async function render(funds: SharedFund[] = [], support: SupportRecord[] = []) {
    const user = signal<Me | null>({ id: 'user', displayName: 'Parent', email: 'parent@example.test' });
    const currentFamily = signal<FamilySummary | null>({ id: 'family', name: 'Family', timeZone: 'UTC', role: 'Parent' });
    const api = {
      family: vi.fn().mockResolvedValue({
        members: [
          { membershipId: 'parent', isYou: true, role: 'Parent' },
          { membershipId: 'co-parent', isYou: false, role: 'Parent' },
        ],
      }),
      children: vi.fn().mockResolvedValue([{ id: 'child-1', firstName: 'Jordan', status: 'Active' }]),
      sharedFunds: vi.fn().mockResolvedValue(funds),
      childSupport: vi.fn().mockResolvedValue(support),
      createChildSupport: vi.fn(),
      reportContribution: vi.fn(),
      reportSupportPayment: vi.fn(),
      respondToEntry: vi.fn(),
      sharedRecordsAttention: vi.fn().mockResolvedValue({ count: 0 }),
      entryAttachmentUrl: (familyId: string, id: string) => `/api/families/${familyId}/shared-records/entries/${id}/attachment`,
      proposeSharedFund: vi.fn().mockResolvedValue({ id: 'new', approvalId: 'new-approval', status: 'AwaitingAgreement' }),
      approve: vi.fn().mockResolvedValue({ status: 'Approved' }),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Api, useValue: api }, { provide: AuthStore, useValue: { user, currentFamily, status: () => 'signed-in' } }],
    });
    const fixture = TestBed.createComponent(SharedRecordsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const page: HTMLElement = fixture.nativeElement;
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.textContent).not.toContain('Loading shared records');
    });
    const button = (label: string) => Array.from(page.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    return { api, button, currentFamily, fixture, page };
  }

  it('submits the approved form and shows that the co-parent still needs to agree', async () => {
    const { api, button, fixture, page } = await render();
    button('New request')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    for (const [name, value] of [['title', 'School supplies'], ['yourShare', '180'], ['coParentShare', '120']]) {
      const input = page.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    }
    page.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    page.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.proposeSharedFund).toHaveBeenCalledWith('family', {
      title: 'School supplies', currency: 'USD', childIds: ['child-1'],
      proposerShareMinor: 18000, coParentShareMinor: 12000,
    });
    expect(page.textContent).toContain('Awaiting agreement');
    expect(page.textContent).toContain('Waiting for your co-parent to agree.');
    expect(button('Agree to proposal')).toBeUndefined();
  });

  it('shows the viewer’s share and agrees to the exact request as the other parent', async () => {
    const { api, button, fixture, page } = await render([fund]);
    expect(page.textContent).toContain('You $120.00');
    button('Agree to proposal')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(api.approve).toHaveBeenCalledWith('family', 'approval-1');
    expect(page.textContent).toContain('Agreed split');
    expect(button('Agree to proposal')).toBeUndefined();
  });

  it('removes loaded fund details when switching to a child profile', async () => {
    const { api, currentFamily, fixture, page } = await render([fund]);
    expect(page.textContent).toContain('School supplies');

    currentFamily.set({ id: 'family', name: 'Family', timeZone: 'UTC', role: 'Child' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.textContent).not.toContain('School supplies');
    expect(page.textContent).not.toContain('Shared records');
    expect(api.sharedFunds).toHaveBeenCalledTimes(1);
  });

  const entry = (overrides: Partial<RecordEntry>): RecordEntry => ({
    id: 'entry', yours: false, amountMinor: 4000, paidOn: '2026-11-07', paidTo: 'Vendor', submittedAt: '2026-11-07T14:16:00Z',
    status: 'Pending', respondedAt: null, attachmentType: 'application/pdf', canRespond: false, ...overrides,
  });
  const openFund: SharedFund = {
    ...fund, status: 'Open', proposerId: 'parent',
    entries: [
      entry({ id: 'mine', yours: true, amountMinor: 4000 }),
      entry({ id: 'theirs', amountMinor: 16000, status: 'Acknowledged', respondedAt: '2026-11-06T12:00:00Z' }),
    ],
    totals: { acknowledgedMinor: 16000, pendingMinor: 4000, disputedMinor: 0 },
  };

  it('shows only acknowledged contributions as progress, with pending amounts in text', async () => {
    const { page } = await render([openFund]);
    const progress = Array.from(page.querySelectorAll('app-record-progress p'), p => p.textContent!.trim()).join(' ');
    expect(progress).toContain('Acknowledged $160.00');
    expect(progress).toContain('of $300.00 agreed target');
    expect(progress).toContain('$40.00 awaiting acknowledgment');
    expect(progress).toContain('$140.00 to reach target');
    expect(page.querySelector('.thermometer')!.getAttribute('aria-hidden')).toBe('true');
    const history = page.querySelectorAll('app-record-history li');
    expect(history).toHaveLength(2);
    expect(history[0].textContent).toContain('Awaiting acknowledgment');
    expect(history[1].textContent).toContain('Acknowledged');
    expect(history[0].querySelector('a')!.getAttribute('href')).toBe('/api/families/family/shared-records/entries/mine/attachment');
    // The reporter can't answer their own report.
    expect(page.textContent).not.toContain('Acknowledge contribution');
  });

  it('lets the other parent confirm receipt or flag a mismatch, and a mismatch never counts', async () => {
    const pending = { ...openFund, entries: [entry({ id: 'transfer', paidTo: 'CoParent', canRespond: true })],
      totals: { acknowledgedMinor: 0, pendingMinor: 4000, disputedMinor: 0 } };
    const { api, button, fixture, page } = await render([pending]);
    expect(button('Acknowledge contribution')).toBeUndefined();
    api.respondToEntry.mockResolvedValue(entry({ id: 'transfer', paidTo: 'CoParent', status: 'Disputed', respondedAt: '2026-11-07T15:00:00Z' }));
    Array.from(page.querySelectorAll('button')).find(b => b.textContent!.includes('Flag a mismatch'))!.click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.textContent).toContain('Mismatch flagged');
    });
    expect(api.respondToEntry).toHaveBeenCalledWith('family', 'transfer', 'dispute');
    const progress = Array.from(page.querySelectorAll('app-record-progress p'), p => p.textContent!.trim()).join(' ');
    expect(progress).toContain('Acknowledged $0.00');
    expect(progress).toContain('$40.00 flagged as a mismatch, not counted');
  });

  it('keeps the report and its request id when sending fails, then records it on retry', async () => {
    const { api, button, fixture, page } = await render([openFund]);
    button('Report contribution')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const amount = page.querySelector<HTMLInputElement>('input[name="amount"]')!;
    amount.value = '40';
    amount.dispatchEvent(new Event('input'));
    // No attachment: nothing is sent.
    page.querySelector('app-report-form form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(page.textContent).toContain('A report can’t be sent without one.');
    expect(api.reportContribution).not.toHaveBeenCalled();

    const picker = page.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['%PDF-1.4'], 'soccer-payment.pdf', { type: 'application/pdf' });
    Object.defineProperty(picker, 'files', { value: [file], configurable: true });
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(page.textContent).toContain('soccer-payment.pdf');

    api.reportContribution.mockRejectedValueOnce(new Error('offline'));
    page.querySelector('app-report-form form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.textContent).toContain('Your entries are still here.');
    });
    expect(page.querySelector<HTMLInputElement>('input[name="amount"]')!.value).toBe('40');

    api.reportContribution.mockResolvedValueOnce(entry({ id: 'new', yours: true, amountMinor: 4000 }));
    page.querySelector('app-report-form form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.querySelector('app-report-form')).toBeNull();
    });
    const [first, second] = api.reportContribution.mock.calls;
    expect(first[2]).toMatchObject({ amountMinor: 4000, paidTo: 'Vendor', file });
    expect(second[2].requestId).toBe(first[2].requestId);
    expect(page.querySelectorAll('app-record-history li')).toHaveLength(3);
  });

  it('labels Child Support as its own record type, and only the paying parent reports payments', async () => {
    const record: SupportRecord = {
      id: 'support-1', title: 'November 2026', currency: 'USD', youPay: false, referenceMinor: 50000,
      createdAt: '2026-11-07T12:00:00Z', createdByYou: true,
      entries: [entry({ id: 'paid', paidTo: 'CoParent', amountMinor: 25000, status: 'Acknowledged', respondedAt: '2026-11-07T13:00:00Z' })],
      totals: { acknowledgedMinor: 25000, pendingMinor: 0, disputedMinor: 0 },
    };
    const { button, fixture, page } = await render([openFund], [record]);
    const support = Array.from(page.querySelectorAll<HTMLButtonElement>('.record-link')).find(b => b.textContent!.includes('November 2026'))!;
    expect(support.textContent).toContain('Child Support');
    support.click();
    fixture.detectChanges();
    expect(page.querySelector('.badge.support')!.textContent).toBe('Child Support');
    expect(page.textContent).toContain('Receipt confirmed');
    expect(page.textContent).toContain('of $500.00 reference amount');
    expect(page.textContent).toContain('Use your required payment channel.');
    expect(button('Report payment')).toBeUndefined();
  });

  it('creates a Child Support record from the request type picker', async () => {
    const { api, button, fixture, page } = await render([], []);
    button('New request')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    Array.from(page.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(b => b.textContent!.includes('Child Support'))!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const title = page.querySelector<HTMLInputElement>('input[name="supportTitle"]')!;
    title.value = 'November 2026';
    title.dispatchEvent(new Event('input'));
    page.querySelectorAll<HTMLInputElement>('input[name="youPay"]')[0].click();
    const reference = page.querySelector<HTMLInputElement>('input[name="reference"]')!;
    reference.value = '500';
    reference.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    api.createChildSupport.mockResolvedValue({
      id: 'support-2', title: 'November 2026', currency: 'USD', youPay: true, referenceMinor: 50000,
      createdAt: '2026-11-07T12:00:00Z', createdByYou: true, entries: [],
      totals: { acknowledgedMinor: 0, pendingMinor: 0, disputedMinor: 0 },
    });
    page.querySelector('app-support-form form')!.dispatchEvent(new Event('submit'));
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.textContent).toContain('No payments reported yet.');
    });
    expect(api.createChildSupport).toHaveBeenCalledWith('family', { title: 'November 2026', currency: 'USD', youPay: true, referenceMinor: 50000 });
    expect(button('Report payment')).toBeDefined();
  });
});
