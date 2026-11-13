import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WhatHelpsValues } from '../../core/api/api';
import { WhatHelpsSection } from './what-helps-section';

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
    expect(host.querySelector('.latest')?.textContent).toContain('Listen to quiet music');
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
    expect(history.querySelector('.comparison > div:first-child')?.textContent).toContain('Listen to quiet music');
    expect(history.querySelector('.comparison > div:last-child')?.textContent).toContain('Read together');
    http.verify();
  });
});
