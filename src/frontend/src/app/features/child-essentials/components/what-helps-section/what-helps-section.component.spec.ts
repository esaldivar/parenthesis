import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WhatHelpsValues } from '../../../../core/api/api';
import { WhatHelpsSection } from './what-helps-section.component';

describe('What Helps', () => {
  const url = '/api/families/family-1/children/child-1/essentials/what-helps';
  const empty: WhatHelpsValues = { comfortItems: null, calmingStrategies: null };

  it('keeps the draft after a conflicting save and retries against the reviewed revision', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(WhatHelpsSection);
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
    click('Edit What Helps');
    const calmingStrategies = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="calmingStrategies"]')!;
    calmingStrategies.value = 'Read together';
    calmingStrategies.dispatchEvent(new Event('input', { bubbles: true }));
    click('Save');
    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.revision).toBe(0);
    expect(save.request.body.values.calmingStrategies).toBe('Read together');
    save.flush({ revision: 1, values: { ...empty, calmingStrategies: 'Listen to quiet music' } }, { status: 409, statusText: 'Conflict' });
    await settle();
    expect(calmingStrategies.value).toBe('Read together');
    expect(host.querySelector('form .inset')?.textContent).toContain('Calming strategies: Listen to quiet music');
    click('Save my draft');
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body.revision).toBe(1);
    expect(retry.request.body.values.calmingStrategies).toBe('Read together');
    retry.flush({ revision: 2, values: { ...empty, calmingStrategies: 'Read together' } });
    await settle();
    expect(host.textContent).toContain('What Helps saved.');

    click('History');
    http.expectOne({ method: 'GET', url: url + '/history' }).flush({
      entries: [{
        revision: 2, editedBy: 'Parent A', editedAt: '2026-11-06T20:00:00Z',
        previous: { ...empty, calmingStrategies: 'Listen to quiet music' }, current: { ...empty, calmingStrategies: 'Read together' },
      }],
      beforeRevision: null,
    });
    await settle();
    const history = host.querySelector('#what-helps-history')!;
    expect(history.textContent).toContain('Parent A');
    expect(history.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-06T20:00:00Z');
    expect(history.querySelectorAll('.change .inset')[0]?.textContent).toContain('Listen to quiet music');
    expect(history.querySelectorAll('.change .inset')[1]?.textContent).toContain('Read together');
    // Close history puts the saved values back (#667).
    click('Close history');
    expect(host.querySelector('#what-helps-history')).toBeNull();
    expect(host.querySelector('.panel')?.textContent).toContain('Read together');
    http.verify();
  });

  it('blocks saving over 1,000 characters with a message and count, and offers Retry after a failed save (#667)', async () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(WhatHelpsSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne({ method: 'GET', url }).flush({ revision: 4, values: { comfortItems: 'Soft blanket', calmingStrategies: null } });
    await fixture.whenStable(); fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const button = (label: string) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label)!;
    button('Edit What Helps').click();
    fixture.detectChanges();
    const comfort = host.querySelector<HTMLTextAreaElement>('textarea[formcontrolname="comfortItems"]')!;
    expect(comfort.value).toBe('Soft blanket');
    comfort.value = 'x'.repeat(1012);
    comfort.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(comfort.getAttribute('aria-invalid')).toBe('true');
    const limit = host.querySelector(`#${comfort.getAttribute('aria-describedby')}`)!;
    expect(limit.textContent).toContain('Keep this to 1,000 characters or fewer.');
    expect(limit.textContent).toContain('1,012 / 1,000 characters');
    expect(button('Save').disabled).toBe(true);

    comfort.value = 'Soft blanket and bunny';
    comfort.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(comfort.hasAttribute('aria-describedby')).toBe(false);
    button('Save').click();
    http.expectOne({ method: 'PUT', url }).flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('Your draft is still here.');
    expect(comfort.value).toBe('Soft blanket and bunny');
    button('Retry').click();
    const retry = http.expectOne({ method: 'PUT', url });
    expect(retry.request.body).toEqual({ revision: 4, values: { comfortItems: 'Soft blanket and bunny', calmingStrategies: '' } });
    retry.flush({ revision: 5, values: { comfortItems: 'Soft blanket and bunny', calmingStrategies: null } });
    await fixture.whenStable(); fixture.detectChanges();
    expect(host.textContent).toContain('What Helps saved.');
    http.verify();
  });
});
