import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { AllergiesFoodValues, attachmentName } from '../../../../core/api/api';
import { AllergiesFoodSection } from './allergies-food-section.component';

describe('Allergies & Food', () => {
  const url = '/api/families/family-1/children/child-1/essentials/allergies-food';
  const empty: AllergiesFoodValues = { allergies: null, noKnownAllergies: false, foodPreferences: null };

  it('requests Spanish labels for the allergy PDF without changing the selected child', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(LocaleService).setLocale('es-419');
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('[aria-controls="allergy-pdf-options"]')!.click();
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('#allergy-pdf-options button')!.click();
    const request = http.expectOne(r => r.url.endsWith('/allergies/pdf'));
    expect(request.request.params.get('language')).toBe('es-419');
    expect(request.request.params.get('childId')).toBe('child-1');
    request.flush(new Blob(), { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('#allergy-pdf-options')?.textContent).not.toContain('couldn');
    TestBed.inject(LocaleService).setLocale('en');
    localStorage.clear();
    http.verify();
  });

  it('requests an export for all children and reports download failure', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();

    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Download allergy PDF')!.click();
    fixture.detectChanges();
    const picker = host.querySelector('select')!;
    expect(picker.value).toBe('child-1');
    picker.value = '';
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Download PDF')!.click();
    const request = http.expectOne('/api/families/family-1/child-essentials/allergies/pdf?language=en');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(), { status: 403, statusText: 'Forbidden' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('#allergy-pdf-options')?.textContent).toContain('couldn’t be downloaded');
    http.verify();
  });

  it('saves the PDF under the dated name the server gave it', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await fixture.whenStable();
    fixture.detectChanges();
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => 'blob:pdf', revokeObjectURL: () => undefined }));
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Download allergy PDF')!.click();
    fixture.detectChanges();
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Download PDF')!.click();
    http.expectOne((r) => r.url === '/api/families/family-1/child-essentials/allergies/pdf').flush(new Blob(['%PDF']), {
      headers: { 'Content-Disposition': "attachment; filename=allergies-2026-11-07.pdf; filename*=UTF-8''allergies-2026-11-07.pdf" },
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(names).toEqual(['allergies-2026-11-07.pdf']);
    click.mockRestore();
    vi.unstubAllGlobals();
    http.verify();
  });

  it('reads a file name from either Content-Disposition form', () => {
    expect(attachmentName('attachment; filename="allergies-2026-11-07.pdf"')).toBe('allergies-2026-11-07.pdf');
    expect(attachmentName("attachment; filename*=UTF-8''Kai%E2%80%99s.pdf")).toBe('Kai’s.pdf');
    expect(attachmentName('attachment')).toBeNull();
    expect(attachmentName(null)).toBeNull();
  });

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

  it('keeps nothing recorded, an explicit No known allergies and allergy text apart (#662)', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const allergies = () => host.querySelector('section > .panel .row dd')!.textContent!.trim();
    expect(allergies()).toBe('No allergies listed');
    expect(host.querySelector('.panel')!.classList).toContain('panel--stacked');

    const component = fixture.componentInstance as unknown as { current: { set(v: unknown): void } };
    component.current.set({ revision: 1, values: { ...empty, noKnownAllergies: true } });
    fixture.detectChanges();
    expect(allergies()).toBe('No known allergies');
    component.current.set({ revision: 2, values: { ...empty, allergies: 'Sesame', noKnownAllergies: true } });
    fixture.detectChanges();
    expect(allergies()).toBe('Sesame');

    // Edit starts from the saved values, with a real checkbox described by the replacement hint.
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Edit'))!.click();
    fixture.detectChanges();
    const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(box.checked).toBe(true);
    expect(host.querySelector(`#${box.getAttribute('aria-describedby')}`)!.textContent).toContain('replaces the No known allergies status');
    expect(host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="allergies"]')!.value).toBe('Sesame');
    http.verify();
  });

  it('keeps the draft and the form open when a save fails (#662)', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(AllergiesFoodSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 3, values: { ...empty, allergies: 'Sesame' } });
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    [...host.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Edit'))!.click();
    fixture.detectChanges();
    const notes = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="allergies"]')!;
    notes.value = 'Sesame and kiwi';
    notes.dispatchEvent(new Event('input'));
    host.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body).toEqual({ revision: 3, values: { allergies: 'Sesame and kiwi', noKnownAllergies: false, foodPreferences: '' } });
    save.flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Your draft is still here.');
    expect(host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="allergies"]')!.value).toBe('Sesame and kiwi');
    http.verify();
  });
});
