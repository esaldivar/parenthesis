import { TestBed } from '@angular/core/testing';
import { SharedFundDraft } from '../../core/api/api';
import { SharedFundProposalForm } from './shared-fund-proposal-form';

describe('SharedFundProposalForm', () => {
  async function render() {
    const fixture = TestBed.createComponent(SharedFundProposalForm);
    fixture.componentRef.setInput('children', [{ id: 'child-1', displayName: 'Jordan' }]);
    const proposals: SharedFundDraft[] = [];
    fixture.componentInstance.proposal.subscribe(draft => proposals.push(draft));
    await fixture.whenStable();

    const page: HTMLElement = fixture.nativeElement;
    const fill = (name: string, value: string) => {
      const control = page.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
      control.value = value;
      control.dispatchEvent(new Event('input'));
    };
    const submit = () => page.querySelector('form')!.dispatchEvent(new Event('submit'));
    return { fixture, page, fill, submit, proposals };
  }

  it('shows and submits unequal shares in minor units with the selected child', async () => {
    const { fixture, page, fill, submit, proposals } = await render();
    fill('title', ' Fall soccer fees ');
    fill('yourShare', '180.10');
    fill('coParentShare', '120,20');
    page.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await fixture.whenStable();

    expect(page.querySelector('.total')?.textContent).toContain('300.30');
    submit();
    expect(proposals).toEqual([{
      title: 'Fall soccer fees',
      childIds: ['child-1'],
      currency: 'USD',
      proposerShareMinor: 18010,
      coParentShareMinor: 12020,
    }]);
  });

  it('keeps invalid and zero-total drafts local', async () => {
    const { fixture, page, fill, submit, proposals } = await render();
    fill('title', 'School supplies');
    fill('yourShare', '0.001');
    fill('coParentShare', '0');
    submit();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('two decimal places');
    fill('yourShare', '0');
    submit();
    expect(proposals).toEqual([]);
  });
});
