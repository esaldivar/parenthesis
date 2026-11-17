import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ClothingValues } from '../../../../core/api/api';
import { ClothingSection } from './clothing-section.component';

describe('Clothing & Shoes', () => {
  const url = '/api/families/family-1/children/child-1/essentials/clothing';
  const empty: ClothingValues = { topSize: null, bottomSize: null, shoeSize: null, fitNotes: null };

  function setup() {
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
    const field = (name: keyof ClothingValues) =>
      host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[formcontrolname="${name}"]`)!;
    const type = (name: keyof ClothingValues, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input', { bubbles: true }));
    };
    const row = (label: string) =>
      [...host.querySelectorAll('section > .panel .row')].find((item) => item.querySelector('.label')?.textContent === label);
    return { fixture, http, host, click, settle, field, type, row };
  }

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    const { fixture, http, host, click, settle, field, type } = setup();
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await settle();
    expect(host.textContent).toContain('Not set');
    click('Edit clothing and shoes');
    type('shoeSize', '4');
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values.shoeSize).toBe('4');
    save.flush({ revision: 1, values: { ...empty, shoeSize: '5' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(field('shoeSize').value).toBe('4');
    expect(host.querySelector('.latest [role="alert"]')?.textContent).toContain('Your co-parent saved changes first.');
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
    expect(history.querySelector('h4')?.textContent).toBe('Clothing & Shoes history');
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('5');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('4');
    http.verify();
  });

  it('shows stored fit notes as Clothing notes, with the helper text, and saves them under the same field (#660)', async () => {
    const { fixture, http, host, click, settle, field, type, row } = setup();
    const notes = 'Needs a winter coat.\nSoft waistbands.';
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 3, values: { ...empty, topSize: 'Youth M', fitNotes: notes } });
    await settle();
    expect(host.textContent).not.toContain('Fit notes');
    expect([...host.querySelectorAll('section > .panel .label')].map((label) => label.textContent))
      .toEqual(['Top size', 'Bottom size', 'Shoe size', 'Clothing notes']);
    expect(row('Clothing notes')?.classList).toContain('row--stacked');
    expect(row('Clothing notes')?.querySelector('dd')?.textContent).toBe(notes);
    expect(row('Bottom size')?.querySelector('dd')?.textContent).toBe('Not set');

    click('Edit clothing and shoes');
    expect(host.textContent).toContain('Clothing notes (optional)');
    expect(field('fitNotes').value).toBe(notes);
    expect(field('topSize').value).toBe('Youth M');
    const help = host.querySelector(`#${field('fitNotes').getAttribute('aria-describedby')}`);
    expect(help?.textContent).toBe('What’s needed, what fits, and any preferences.');
    expect(field('topSize').getAttribute('maxlength')).toBe('64');
    expect(field('fitNotes').getAttribute('maxlength')).toBe('1000');

    type('shoeSize', 'US kids 4 / wide');
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body).toEqual({ revision: 3, values: { topSize: 'Youth M', bottomSize: '', shoeSize: 'US kids 4 / wide', fitNotes: notes } });
    save.flush({ revision: 4, values: { ...empty, topSize: 'Youth M', shoeSize: 'US kids 4 / wide', fitNotes: notes } });
    await settle();
    expect(row('Clothing notes')?.querySelector('dd')?.textContent).toBe(notes);
    http.verify();
  });

  it('keeps the draft and the form open when a save fails, then Cancel keeps the saved values', async () => {
    const { fixture, http, host, click, settle, field, type, row } = setup();
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: { ...empty, topSize: 'Youth S' } });
    await settle();
    click('Edit clothing and shoes');
    type('topSize', 'Youth M');
    type('fitNotes', 'Needs boots');
    click('Save');
    http.expectOne({ method: 'PUT', url }).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('Changes couldn’t be saved. Your draft is still here.');
    expect(field('topSize').value).toBe('Youth M');
    expect(field('fitNotes').value).toBe('Needs boots');
    click('Cancel');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(row('Top size')?.querySelector('dd')?.textContent).toBe('Youth S');
    http.verify();
  });

  it('adopts the latest saved values when Cancel follows a conflict', async () => {
    const { fixture, http, click, settle, type, row } = setup();
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await settle();
    click('Edit clothing and shoes');
    type('topSize', 'Mine');
    click('Save');
    http.expectOne({ method: 'PUT', url })
      .flush({ revision: 1, values: { ...empty, topSize: 'Theirs', fitNotes: 'Winter coat is available.' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    click('Cancel');
    expect(row('Top size')?.querySelector('dd')?.textContent).toBe('Theirs');
    expect(row('Clothing notes')?.querySelector('dd')?.textContent).toBe('Winter coat is available.');
    click('Edit clothing and shoes');
    click('Save');
    expect(http.expectOne({ method: 'PUT', url }).request.body.revision).toBe(1);
  });

  it('shows empty history and a retry when history fails', async () => {
    const { fixture, http, host, click, settle } = setup();
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: empty });
    await settle();
    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush(null, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(host.querySelector('#clothing-history [role="alert"]')?.textContent).toContain('History couldn’t be loaded');
    click('Try again');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({ entries: [], beforeRevision: null });
    await settle();
    expect(host.querySelector('#clothing-history')?.textContent).toContain('No changes yet.');
    http.verify();
  });
});
