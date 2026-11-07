import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AllergiesFoodValues } from '../../core/api/api';
import { AllergiesFoodSection } from './allergies-food-section';

describe('Allergies & Food', () => {
  const url = '/api/families/family-1/children/child-1/essentials/allergies-food';
  const empty: AllergiesFoodValues = { allergies: null, noKnownAllergies: false, foodPreferences: null };

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    const click = (label: string) => {
      const button = [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
      expect(button).toBeDefined();
      button!.click();
      fixture.detectChanges();
    };
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await settle();
    expect(host.textContent).toContain('No allergies listed');
    click('Edit Allergies & Food');
    const foodPreferences = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="foodPreferences"]')!;
    foodPreferences.value = 'Vegetarian meals';
    foodPreferences.dispatchEvent(new Event('input', { bubbles: true }));
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values.foodPreferences).toBe('Vegetarian meals');
    save.flush({ revision: 1, values: { ...empty, foodPreferences: 'Dairy-free meals' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(foodPreferences.value).toBe('Vegetarian meals');
    expect(host.querySelector('.latest')?.textContent).toContain('Dairy-free meals');
    click('Save my draft');
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body.revision).toBe(1);
    expect(retry.request.body.values.foodPreferences).toBe('Vegetarian meals');
    retry.flush({ revision: 2, values: { ...empty, foodPreferences: 'Vegetarian meals' } });
    await settle();
    expect(host.textContent).toContain('Allergies & Food saved.');

    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({
      entries: [{
        revision: 2, editedBy: 'Parent A', editedAt: '2026-11-06T20:00:00Z',
        previous: { ...empty, foodPreferences: 'Dairy-free meals' }, current: { ...empty, foodPreferences: 'Vegetarian meals' },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#allergies-food-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('Dairy-free meals');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('Vegetarian meals');
    http.verify();
  });
});
