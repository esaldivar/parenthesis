import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoutinesValues } from '../../core/api/api';
import { RoutinesSection } from './routines-section';

describe('Routines', () => {
  const url = '/api/families/family-1/children/child-1/essentials/routines';
  const empty: RoutinesValues = { bedtime: null, naps: null };

  it('preserves a household draft across tabs and reviews a conflicting revision before retrying', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RoutinesSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    const values = (bedtime: string) => ({ bedtime, naps: null });
    const mine = {
      ownerId: 'parent-1', ownerName: 'Parent A', isMine: true,
      latest: { revision: 1, values: values('Eight') }, shared: null, canAccept: false,
    };
    const other = {
      ownerId: 'parent-2', ownerName: 'Parent B', isMine: false,
      latest: { revision: 1, values: values('Nine') }, shared: null, canAccept: true,
    };
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
    const draft = () => host.querySelector('textarea') as HTMLTextAreaElement;
    fixture.detectChanges();
    http.expectOne(url).flush({ revision: 0, values: empty });
    http.expectOne(url + '/households').flush([mine, other]);
    await settle();

    click('My routines');
    draft().value = 'My unsaved bedtime';
    draft().dispatchEvent(new Event('input', { bubbles: true }));
    click('Parent B’s routines');
    click('My routines');
    expect(draft().value).toBe('My unsaved bedtime');
    click('Save my routines');
    const conflict = http.expectOne({ method: 'PUT', url: url + '/households/parent-1' });
    expect(conflict.request.body.revision).toBe(1);
    conflict.flush({ revision: 2, values: values('Latest from another device') }, { status: 409, statusText: 'Conflict' });
    await Promise.resolve();
    await Promise.resolve();
    const latest = { ...mine, latest: { revision: 2, values: values('Latest from another device') } };
    http.expectOne(url + '/households').flush([latest, other]);
    await settle();
    expect(draft().value).toBe('My unsaved bedtime');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.textContent).toContain('Latest from another device');
    });
    click('Shared');
    click('My routines');
    expect(draft().value).toBe('My unsaved bedtime');
    click('Save my routines');
    const retry = http.expectOne({ method: 'PUT', url: url + '/households/parent-1' });
    expect(retry.request.body).toMatchObject({ revision: 2, values: { bedtime: 'My unsaved bedtime', naps: '' } });
    retry.flush({ revision: 3, values: values('My unsaved bedtime') });
    await Promise.resolve();
    await Promise.resolve();
    http.expectOne(url + '/households').flush([{ ...mine, latest: { revision: 3, values: values('My unsaved bedtime') } }, other]);
    await settle();
    http.verify();
  });

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
    http.expectOne({ method: 'GET', url: url + '/households' }).flush([]);
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
