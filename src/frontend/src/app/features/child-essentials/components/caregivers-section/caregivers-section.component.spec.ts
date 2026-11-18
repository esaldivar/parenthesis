import { TestBed } from '@angular/core/testing';
import { Api, CaregiverList } from '../../../../core/api/api';
import { CaregiversSection } from './caregivers-section.component';

// #664: the Shared Caregivers sheet. Synthetic data only.
describe('Shared Caregivers sheet', () => {
  const details = { name: 'Casey Park', phone: '512-555-0100', city: null, hourlyRate: null, schoolPickup: false, role: null, notes: null };

  async function setup(api: Partial<Record<keyof Api, unknown>>) {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const fixture = TestBed.createComponent(CaregiversSection);
    fixture.componentRef.setInput('familyId', 'family');
    fixture.componentRef.setInput('childId', 'kai');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label)!;
    const type = (selector: string, value: string) => {
      const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    return { fixture, host, button, type };
  }

  it('saves role and notes, asks before discarding changes, and offers Retry after a failed save', async () => {
    const list: CaregiverList = { version: 3, caregivers: [] };
    const api = {
      caregivers: vi.fn(async () => list),
      saveCaregiver: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined),
    };
    const { fixture, host, button, type } = await setup(api);
    button('Add caregiver').click();
    fixture.detectChanges();
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(host.querySelector('#caregiver-sheet-title')?.textContent).toBe('Add caregiver');

    // Save with nothing filled in says what's missing and doesn't call the server.
    button('Save').click();
    fixture.detectChanges();
    expect(host.querySelector('dialog [role="alert"]')?.textContent).toContain('Enter a name and a valid phone number.');
    expect(api.saveCaregiver).not.toHaveBeenCalled();

    type('input[formcontrolname="name"]', details.name);
    type('input[formcontrolname="role"]', ' Babysitter ');
    type('input[formcontrolname="phone"]', details.phone);
    type('textarea[formcontrolname="notes"]', 'Knows the bedtime routine.');

    // Cancel with changes asks first; the draft stays.
    button('Cancel').click();
    fixture.detectChanges();
    expect(host.querySelector('.discard')?.textContent).toBe('Discard your unsaved changes?');
    expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true);

    // A failed save keeps the draft and turns Save into Retry.
    button('Save').click();
    await vi.waitFor(() => { fixture.detectChanges(); expect(button('Retry')).toBeDefined(); });
    expect(host.querySelector<HTMLInputElement>('input[formcontrolname="role"]')!.value).toBe(' Babysitter ');
    button('Retry').click();
    await vi.waitFor(() => { fixture.detectChanges(); expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(false); });
    expect(api.saveCaregiver).toHaveBeenLastCalledWith('family', 'kai', null, {
      version: 3, allowDuplicate: false,
      details: { name: 'Casey Park', phone: '512-555-0100', city: '', hourlyRate: null, schoolPickup: false, role: 'Babysitter', notes: 'Knows the bedtime routine.' },
    });
  });

  it('confirms removal in the sheet and keeps the record until confirmed', async () => {
    const list: CaregiverList = { version: 5, caregivers: [{ id: 'cg-1', details, myRating: null, averageRating: null, addedBy: 'Parent' }] };
    const api = { caregivers: vi.fn(async () => list), removeCaregiver: vi.fn(async () => undefined) };
    const { fixture, host, button } = await setup(api);
    button('Remove').click();
    fixture.detectChanges();
    expect(host.querySelector('#caregiver-sheet-title')?.textContent).toBe('Remove caregiver');
    expect(host.querySelector('dialog')?.textContent).toContain('Casey Park');
    button('Cancel removal').click();
    fixture.detectChanges();
    expect(api.removeCaregiver).not.toHaveBeenCalled();
    button('Remove').click();
    fixture.detectChanges();
    button('Confirm removal').click();
    await vi.waitFor(() => expect(api.removeCaregiver).toHaveBeenCalledWith('family', 'kai', 'cg-1', 5));
  });
});
