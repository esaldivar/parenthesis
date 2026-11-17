import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SchoolValues } from '../../../../core/api/api';
import { SchoolSection } from './school-section.component';

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
    // A save from before the contact fields existed shows only the fields it had (Figma 147:125).
    expect(history.textContent).not.toContain('School name');
    http.verify();
  });

  it('shows the approved field order, Not set for new fields, and formats only U.S. teacher phone numbers', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(SchoolSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 0, values: { ...empty, grade: '3', homeroomTeacher: 'Teacher A' } });
    await fixture.whenStable();
    fixture.detectChanges();
    const labels = () => [...host.querySelectorAll('dt .label')].map((item) => item.textContent.trim());
    const values = () => [...host.querySelectorAll('dd')].map((item) => item.textContent.trim());
    expect(labels()).toEqual([
      'School name', 'School address (optional)', 'Grade', 'Homeroom teacher', 'Teacher email (optional)',
      'Teacher phone number (optional)', 'Parent concerns',
    ]);
    expect(values()).toEqual(['Not set', 'Not set', '3', 'Teacher A', 'Not set', 'Not set', 'Not set']);
    // No checkmark or pill: Edit and History are plain outlined buttons.
    expect(host.querySelector('.updated-pill, app-icon')).toBeNull();
    http.verify();
  });

  it('saves the new fields as typed and refuses an email without an @ until it is fixed', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(SchoolSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); };
    const type = (name: string, value: string) => {
      const field = host.querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`)!;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('blur'));
      fixture.detectChanges();
    };
    const button = (label: string) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label)!;
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ revision: 4, values: empty });
    await settle();
    button('Edit School').click();
    fixture.detectChanges();
    const order = [...host.querySelectorAll('form .field .label')].map((item) => item.textContent.trim());
    expect(order).toEqual([
      'School name', 'School address (optional)', 'Grade', 'Teacher email (optional)',
      'Teacher phone number (optional)', 'Parent concerns (optional)',
    ]);
    type('schoolName', 'Example Elementary');
    type('schoolAddress', '1 Sample Way, Testville');
    type('teacherEmail', 'teacher.example.com');
    type('teacherPhone', '+44 20 7946 0000');
    button('Save').click();
    fixture.detectChanges();
    http.expectNone({ method: 'PUT', url });
    const email = host.querySelector<HTMLInputElement>('[formcontrolname="teacherEmail"]')!;
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('#school-email-error')?.textContent).toContain('name@example.com');
    type('teacherEmail', 'teacher@example.com');
    button('Save').click();
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body).toEqual({
      revision: 4,
      values: {
        schoolName: 'Example Elementary', schoolAddress: '1 Sample Way, Testville', grade: '', homeroomTeacher: null,
        teacherEmail: 'teacher@example.com', teacherPhone: '+44 20 7946 0000', parentConcerns: '',
      },
    });
    save.flush({ revision: 5, values: { ...empty, schoolName: 'Example Elementary', teacherPhone: '+44 20 7946 0000' } });
    await settle();
    expect(host.textContent).toContain('+44 20 7946 0000');
    http.verify();
  });
});
