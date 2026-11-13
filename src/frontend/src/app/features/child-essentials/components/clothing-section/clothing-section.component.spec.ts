import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClothingValues } from '../../../../core/api/api';
import { ClothingSection } from './clothing-section.component';

describe('Clothing & Shoes', () => {
  const url = '/api/families/family-1/children/child-1/essentials/clothing';
  const empty: ClothingValues = { topSize: null, bottomSize: null, shoeSize: null, fitNotes: null };

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(ClothingSection);
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
    expect(host.textContent).toContain('Not set');
    click('Edit clothing and shoes');
    const shoeSize = host.querySelector<HTMLInputElement>('input[formcontrolname="shoeSize"]')!;
    shoeSize.value = '4';
    shoeSize.dispatchEvent(new Event('input', { bubbles: true }));
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values.shoeSize).toBe('4');
    save.flush({ revision: 1, values: { ...empty, shoeSize: '5' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(shoeSize.value).toBe('4');
    expect(host.querySelector('.latest')?.textContent).toContain('5');
    click('Save my draft');
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body.revision).toBe(1);
    expect(retry.request.body.values.shoeSize).toBe('4');
    retry.flush({ revision: 2, values: { ...empty, shoeSize: '4' } });
    await settle();
    expect(host.textContent).toContain('Clothing and shoes saved.');

    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({
      entries: [{
        revision: 2, editedBy: 'Parent A', editedAt: '2026-11-06T20:00:00Z',
        previous: { ...empty, shoeSize: '5' }, current: { ...empty, shoeSize: '4' },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#clothing-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('5');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('4');
    http.verify();
  });
});
