import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, FamilySummary, Me, SharedFund } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { SharedRecordsPage } from './shared-records-page';

describe('SharedRecordsPage', () => {
  const fund: SharedFund = {
    id: 'fund-1', approvalId: 'approval-1', title: 'School supplies', currency: 'USD',
    proposerId: 'co-parent', proposerShareMinor: 18000, coParentShareMinor: 12000,
    childIds: ['child-1'], status: 'AwaitingAgreement',
  };

  async function render(funds: SharedFund[] = []) {
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
      proposeSharedFund: vi.fn().mockResolvedValue({ id: 'new', approvalId: 'new-approval', status: 'AwaitingAgreement' }),
      approve: vi.fn().mockResolvedValue({ status: 'Approved' }),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: Api, useValue: api }, { provide: AuthStore, useValue: { user, currentFamily } }],
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
});
