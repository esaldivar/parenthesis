import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoutineEntry } from '../../core/api/api';
import { RoutinesSection } from './routines-section';

describe('Routines', () => {
  const url = '/api/families/family-1/children/child-1/essentials/routines';
  const addUrl = '/api/families/family-1/essentials/routines';
  const teeth: RoutineEntry = { id: 'r-teeth', title: 'Brushing teeth', details: null };
  const school: RoutineEntry = { id: 'r-school', title: 'Getting ready for school', details: null };

  function setup(children?: readonly { id: string; firstName: string }[]) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(RoutinesSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    if (children) fixture.componentRef.setInput('children', children);
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) => {
      const found = [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
      expect(found, label).toBeDefined();
      return found!;
    };
    const click = (label: string) => {
      button(label).click();
      fixture.detectChanges();
    };
    const type = (selector: string, value: string) => {
      const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    /** The request the component sends once its earlier one has been answered. */
    const next = async (match: { method: string; url: string }) => {
      let request: TestRequest | undefined;
      await vi.waitFor(() => { request = http.expectOne(match); });
      return request!;
    };
    fixture.detectChanges();
    return { fixture, http, host, button, click, type, settle, next };
  }

  it('starts empty and adds one routine to several children in one save', async () => {
    const { http, host, button, click, type, settle, next } = setup([
      { id: 'child-1', firstName: 'Sam' }, { id: 'child-2', firstName: 'Ali' },
    ]);
    (await next({ method: 'GET', url })).flush({ revision: 0, values: { entries: [] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([]);
    await settle();
    expect(host.textContent).toContain('No routines yet.');
    expect(host.textContent).not.toContain('Bedtime');

    click('Add routine');
    expect(host.querySelector<HTMLInputElement>('input[formcontrolname="title"]')!.value).toBe('');
    expect(host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="details"]')!.value).toBe('');
    const boxes = [...host.querySelectorAll<HTMLInputElement>('.child-picker input[type="checkbox"]')];
    expect(boxes.map((box) => box.checked)).toEqual([false, false]);
    expect(button('Save routine').disabled).toBe(true);
    type('input[formcontrolname="title"]', '  Getting ready for school ');
    expect(button('Save routine').disabled).toBe(true);
    boxes[0].click();
    boxes[1].click();
    await settle();
    expect(button('Save routine').disabled).toBe(false);

    click('Save routine');
    const add = await next({ method: 'POST', url: addUrl });
    expect(add.request.body).toEqual({
      routine: { title: 'Getting ready for school', details: null }, childIds: ['child-1', 'child-2'], visibility: 'shared',
    });
    add.flush([]);
    (await next({ method: 'GET', url })).flush({ revision: 1, values: { entries: [school] } });
    await settle();
    expect(host.querySelector('.routines')?.textContent).toContain('Getting ready for school');
    expect(host.textContent).toContain('Routine added.');
    http.verify();
  });

  it('ignores a late answer for the previously selected child', async () => {
    const { fixture, http, host, settle } = setup();
    const otherUrl = '/api/families/family-1/children/child-2/essentials/routines';
    const first = http.expectOne({ method: 'GET', url });
    const firstHomes = http.expectOne({ method: 'GET', url: url + '/households' });
    fixture.componentRef.setInput('childId', 'child-2');
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: otherUrl }).flush({ revision: 2, values: { entries: [teeth] } });
    http.expectOne({ method: 'GET', url: otherUrl + '/households' }).flush([]);
    await settle();

    first.flush({ revision: 5, values: { entries: [school] } });
    firstHomes.error(new ProgressEvent('offline'));
    await settle();
    const routines = host.querySelector('.routines')?.textContent ?? '';
    expect(routines).toContain('Brushing teeth');
    expect(routines).not.toContain('Getting ready for school');
    expect(host.querySelector('[role="alert"]')).toBeNull();
    http.verify();
  });

  it('edits a shared routine, keeps the draft after a conflict and shows history', async () => {
    const { http, host, click, type, settle, next } = setup();
    (await next({ method: 'GET', url })).flush({ revision: 1, values: { entries: [teeth] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([]);
    await settle();

    click('Edit Brushing teeth');
    expect(host.querySelector<HTMLInputElement>('input[formcontrolname="title"]')!.value).toBe('Brushing teeth');
    type('textarea[formcontrolname="details"]', 'Two minutes');
    click('Save routine');
    const save = await next({ method: 'PUT', url });
    expect(save.request.body).toEqual({ revision: 1, values: { entries: [{ ...teeth, details: 'Two minutes' }] } });
    save.flush({ revision: 2, values: { entries: [teeth, school] } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="details"]')!.value).toBe('Two minutes');
    expect(host.querySelector('.latest')?.textContent).toContain('Getting ready for school');

    click('Save my draft');
    const retry = await next({ method: 'PUT', url });
    expect(retry.request.body).toEqual({ revision: 2, values: { entries: [{ ...teeth, details: 'Two minutes' }, school] } });
    retry.flush({ revision: 3, values: { entries: [{ ...teeth, details: 'Two minutes' }, school] } });
    await settle();
    expect(host.textContent).toContain('Routine saved.');
    expect(host.querySelector('.routines')?.textContent).toContain('Two minutes');

    click('History');
    (await next({ method: 'GET', url: url + '/history' })).flush({
      entries: [{
        revision: 3, editedBy: 'Parent A', editedAt: '2026-11-12T20:00:00Z',
        previous: { entries: [teeth, school] }, current: { entries: [{ ...teeth, details: 'Two minutes' }, school] },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#routines-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-12T20:00:00Z');
    expect(history.querySelector('.comparison > div:first-child')?.textContent).not.toContain('Two minutes');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('Two minutes');
    http.verify();
  });

  it('keeps an own-routine draft across tabs, retries after a conflict and adds to my routines', async () => {
    const { fixture, http, host, click, type, settle, next } = setup();
    const lights: RoutineEntry = { id: 'r-lights', title: 'Lights out', details: 'At eight' };
    const bath: RoutineEntry = { id: 'r-bath', title: 'Bath', details: null };
    const mine = (revision: number, entries: readonly RoutineEntry[]) => ({
      ownerId: 'parent-1', ownerName: 'Parent A', isMine: true, latest: { revision, values: { entries } }, shared: null, canAccept: false,
    });
    const other = {
      ownerId: 'parent-2', ownerName: 'Parent B', isMine: false,
      latest: { revision: 1, values: { entries: [{ id: 'r-nap', title: 'Nap', details: null }] } }, shared: null, canAccept: true,
    };
    (await next({ method: 'GET', url })).flush({ revision: 0, values: { entries: [] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([mine(1, [lights]), other]);
    await settle();

    click('My routines');
    click('Edit Lights out');
    type('textarea[name="details"]', 'At nine');
    click('Parent B’s routines');
    expect(host.textContent).toContain('Nap');
    click('My routines');
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="details"]')!.value).toBe('At nine');

    click('Save routine');
    const conflict = await next({ method: 'PUT', url: url + '/households/parent-1' });
    expect(conflict.request.body).toEqual({ revision: 1, action: 'save', values: { entries: [{ ...lights, details: 'At nine' }] } });
    conflict.flush({ revision: 2, values: { entries: [lights, bath] } }, { status: 409, statusText: 'Conflict' });
    (await next({ method: 'GET', url: url + '/households' })).flush([mine(2, [lights, bath]), other]);
    await settle();
    expect(host.querySelector<HTMLTextAreaElement>('textarea[name="details"]')!.value).toBe('At nine');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.latest')?.textContent).toContain('Bath');
    });

    click('Save routine');
    const retry = await next({ method: 'PUT', url: url + '/households/parent-1' });
    expect(retry.request.body).toEqual({ revision: 2, action: 'save', values: { entries: [{ ...lights, details: 'At nine' }, bath] } });
    retry.flush({ revision: 3, values: { entries: [{ ...lights, details: 'At nine' }, bath] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([mine(3, [{ ...lights, details: 'At nine' }, bath]), other]);
    await settle();
    expect(host.querySelector('.routines')?.textContent).toContain('At nine');

    // With no children list given, the routine can still be added to this child.
    click('Add routine');
    expect(host.textContent).toContain('It’s added to your routines at your home.');
    type('input[formcontrolname="title"]', 'Reading');
    host.querySelector<HTMLInputElement>('.child-picker input[type="checkbox"]')!.click();
    await settle();
    click('Save routine');
    const add = await next({ method: 'POST', url: addUrl });
    expect(add.request.body).toEqual({ routine: { title: 'Reading', details: null }, childIds: ['child-1'], visibility: 'mine' });
    add.flush([]);
    (await next({ method: 'GET', url: url + '/households' })).flush([mine(4, [{ ...lights, details: 'At nine' }, bath]), other]);
    await settle();
    expect(host.textContent).toContain('Routine added.');
    http.verify();
  });

  it('moves focus into a form when it opens and back to its button when it closes', async () => {
    const { http, host, button, click, type, settle, next } = setup([{ id: 'child-1', firstName: 'Sam' }]);
    (await next({ method: 'GET', url })).flush({ revision: 1, values: { entries: [teeth] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([]);
    await settle();
    const focused = () => document.activeElement;

    click('Add routine');
    await settle();
    expect(focused()).toBe(host.querySelector('input[formcontrolname="title"]'));
    click('Cancel');
    await settle();
    expect(focused()).toBe(button('Add routine'));

    click('Edit Brushing teeth');
    await settle();
    expect(focused()).toBe(host.querySelector('input[formcontrolname="title"]'));
    click('Cancel');
    await settle();
    expect(focused()).toBe(button('Edit Brushing teeth'));

    click('Edit Brushing teeth');
    type('textarea[formcontrolname="details"]', 'Two minutes');
    click('Save routine');
    (await next({ method: 'PUT', url })).flush({ revision: 2, values: { entries: [{ ...teeth, details: 'Two minutes' }] } });
    await vi.waitFor(async () => {
      await settle();
      expect(focused()).toBe(button('Edit Brushing teeth'));
    });

    click('Add routine');
    type('input[formcontrolname="title"]', 'Reading');
    host.querySelector<HTMLInputElement>('.child-picker input[type="checkbox"]')!.click();
    await settle();
    click('Save routine');
    (await next({ method: 'POST', url: addUrl })).flush([]);
    (await next({ method: 'GET', url })).flush({ revision: 3, values: { entries: [{ ...teeth, details: 'Two minutes' }] } });
    await vi.waitFor(async () => {
      await settle();
      expect(focused()).toBe(button('Add routine'));
    });
    http.verify();
  });

  it('names whose routines the share buttons act on, announces them and keeps focus when they are replaced', async () => {
    const { http, host, button, click, settle, next } = setup();
    const nap = { revision: 1, values: { entries: [{ id: 'r-nap', title: 'Nap', details: null }] } };
    const other = (shared: boolean) => ({
      ownerId: 'parent-2', ownerName: 'Parent B', isMine: false, latest: nap, shared: shared ? nap : null, canAccept: !shared,
    });
    const status = () => [...host.querySelectorAll('[role="status"]')].map((item) => item.textContent.trim()).join(' ');
    const focused = () => document.activeElement;
    (await next({ method: 'GET', url })).flush({ revision: 1, values: { entries: [teeth] } });
    (await next({ method: 'GET', url: url + '/households' })).flush([other(false)]);
    await settle();

    click('Parent B’s routines');
    click('Use in both homes: Parent B’s routines');
    const accept = await next({ method: 'PUT', url: url + '/households/parent-2' });
    expect(accept.request.body).toEqual({ revision: 1, action: 'accept' });
    accept.flush(nap);
    (await next({ method: 'GET', url: url + '/households' })).flush([other(true)]);
    await vi.waitFor(async () => {
      await settle();
      expect(focused()).toBe(button('Stop sharing: Parent B’s routines'));
    });
    expect(status()).toContain('These routines are now used in both homes.');

    click('Shared');
    expect(status()).not.toContain('now used in both homes');
    click('Stop sharing: Parent B’s routines');
    const stop = await next({ method: 'PUT', url: url + '/households/parent-2' });
    expect(stop.request.body).toEqual({ revision: 1, action: 'stop' });
    stop.flush(nap);
    (await next({ method: 'GET', url: url + '/households' })).flush([other(false)]);
    await vi.waitFor(async () => {
      await settle();
      expect(focused()).toBe(button('Shared'));
    });
    expect(status()).toContain('These routines are no longer shared.');
    http.verify();
  });
});
