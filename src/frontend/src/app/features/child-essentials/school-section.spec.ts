import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SchoolValues } from '../../core/api/api';
import { SchoolSection } from './school-section';

describe('School', () => {
  const url = '/api/families/family-1/children/child-1/essentials/school';
  const empty: SchoolValues = { grade: null, homeroomTeacher: null, parentConcerns: null };

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(SchoolSection);
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
    click('Edit School');
    const grade = host.querySelector<HTMLSelectElement>('select[formcontrolname="grade"]')!;
    const setGrade = (value: string) => {
      grade.value = value;
      grade.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
    };
    const teacher = () => host.querySelector<HTMLInputElement>('input[formcontrolname="homeroomTeacher"]');
    expect(teacher()).toBeNull();
    setGrade('5');
    teacher()!.value = 'Teacher A';
    teacher()!.dispatchEvent(new Event('input', { bubbles: true }));
    setGrade('6');
    expect(teacher()).toBeNull();
    const parentConcerns = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="parentConcerns"]')!;
    parentConcerns.value = 'Reading support';
    parentConcerns.dispatchEvent(new Event('input', { bubbles: true }));
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values).toMatchObject({ grade: '6', homeroomTeacher: null });
    expect(save.request.body.values.parentConcerns).toBe('Reading support');
    save.flush({ revision: 1, values: { ...empty, parentConcerns: 'Math support' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(parentConcerns.value).toBe('Reading support');
    expect(host.querySelector('.latest')?.textContent).toContain('Math support');
    click('Save my draft');
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body.revision).toBe(1);
    expect(retry.request.body.values.parentConcerns).toBe('Reading support');
    retry.flush({ revision: 2, values: { ...empty, parentConcerns: 'Reading support' } });
    await settle();
    expect(host.textContent).toContain('School saved.');

    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({
      entries: [{
        revision: 2, editedBy: 'Parent A', editedAt: '2026-11-06T20:00:00Z',
        previous: { ...empty, parentConcerns: 'Math support' }, current: { ...empty, parentConcerns: 'Reading support' },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#school-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('Math support');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('Reading support');
    http.verify();
  });
});
