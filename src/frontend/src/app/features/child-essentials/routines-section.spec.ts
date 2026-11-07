import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoutinesValues } from '../../core/api/api';
import { RoutinesSection } from './routines-section';

describe('Routines', () => {
  const url = '/api/families/family-1/children/child-1/essentials/routines';
  const empty: RoutinesValues = { bedtime: null, naps: null };

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RoutinesSection);
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
    click('Edit Routines');
    const naps = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="naps"]')!;
    naps.value = 'Quiet time at 7:30';
    naps.dispatchEvent(new Event('input', { bubbles: true }));
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values.naps).toBe('Quiet time at 7:30');
    save.flush({ revision: 1, values: { ...empty, naps: 'Lights out at 8:00' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(naps.value).toBe('Quiet time at 7:30');
    expect(host.querySelector('.latest')?.textContent).toContain('Lights out at 8:00');
    click('Save my draft');
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body.revision).toBe(1);
    expect(retry.request.body.values.naps).toBe('Quiet time at 7:30');
    retry.flush({ revision: 2, values: { ...empty, naps: 'Quiet time at 7:30' } });
    await settle();
    expect(host.textContent).toContain('Routines saved.');

    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({
      entries: [{
        revision: 2, editedBy: 'Parent A', editedAt: '2026-11-06T20:00:00Z',
        previous: { ...empty, naps: 'Lights out at 8:00' }, current: { ...empty, naps: 'Quiet time at 7:30' },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#routines-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('Lights out at 8:00');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('Quiet time at 7:30');
    http.verify();
  });
});
