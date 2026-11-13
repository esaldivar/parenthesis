import { TestBed } from '@angular/core/testing';
import { Api, CaregiverList } from '../../core/api/api';
import { CaregiversSection } from './components/caregivers-section/caregivers-section.component';

describe('Adding a shared caregiver to all children', () => {
  it('keeps existing ratings and retries a failed child without adding duplicates', async () => {
    const details = { name: 'Casey Park', phone: '512-555-0100', city: null, hourlyRate: null, schoolPickup: false };
    const saved: CaregiverList = {
      version: 2, caregivers: [{ id: 'existing', details, myRating: 3, averageRating: 3, addedBy: 'Parent' }],
    };
    const lists: Record<string, CaregiverList> = { first: saved, second: { version: 0, caregivers: [] } };
    const api = {
      caregivers: vi.fn(async (_family: string, child: string) => lists[child]),
      saveCaregiver: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    const fixture = TestBed.createComponent(CaregiversSection);
    fixture.componentRef.setInput('familyId', 'family');
    fixture.componentRef.setInput('childId', 'first');
    fixture.componentRef.setInput('children', [{ id: 'first', firstName: 'Morgan' }, { id: 'second', firstName: 'Taylor' }]);
    const host: HTMLElement = fixture.nativeElement;
    const click = (label: string) => [...host.querySelectorAll('button')].find(button => button.textContent.trim() === label)!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    click('Add caregiver');
    fixture.detectChanges();
    for (const [field, value] of [['name', details.name], ['phone', details.phone]]) {
      const input = host.querySelector<HTMLInputElement>(`input[formcontrolname="${field}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    host.querySelector<HTMLInputElement>('input[formcontrolname="addToAll"]')!.click();
    fixture.detectChanges();
    click('Save caregiver');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Taylor');
    });
    click('Save caregiver');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.textContent).toContain('Shared caregiver saved for all children.');
    });
    expect(api.saveCaregiver.mock.calls).toEqual([
      ['family', 'second', null, { version: 0, details: { ...details, city: '' }, allowDuplicate: false }],
      ['family', 'second', null, { version: 0, details: { ...details, city: '' }, allowDuplicate: false }],
    ]);
  });
});
