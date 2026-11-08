import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Api, Child } from '../../core/api/api';
import { AuthStore } from '../../core/auth/auth.store';
import { FromYourKidsPage } from './from-your-kids-page';

describe('From Your Kids parent-facing shell (#531)', () => {
  const family = signal<{ id: string; role: 'Parent' } | null>({ id: 'family-1', role: 'Parent' });
  const children: Child[] = [
    { id: 'kid-1', firstName: 'Kai', status: 'Active', changeRequestId: null, signIn: { enabled: false, locked: false, pinChangePending: false } },
    { id: 'kid-2', firstName: 'Aurora', status: 'Active', changeRequestId: null, signIn: { enabled: false, locked: false, pinChangePending: false } },
  ];
  let load: jasmine.Spy;

  beforeEach(() => {
    family.set({ id: 'family-1', role: 'Parent' });
    load = jasmine.createSpy('children').and.resolveTo(children);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { currentFamily: family } },
        { provide: Api, useValue: { children: (...args: unknown[]) => load(...args) } },
      ],
    });
  });

  it('loads real active child tabs and switches the parent-only sections', async () => {
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(load).toHaveBeenCalledWith('family-1');
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.child-tabs button')];
    expect(tabs.map(button => button.textContent.trim())).toEqual(['Kai', 'Aurora']);
    tabs[1].click();
    fixture.detectChanges();
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    const photos = [...host.querySelectorAll<HTMLButtonElement>('.sections button')].find(button => button.textContent.includes('Photos'))!;
    photos.click();
    fixture.detectChanges();
    expect(host.textContent).toContain('No photos shared with you yet');
    expect(host.querySelector('button[aria-label="Add Photo"]')).toBeNull();
  });

  it('never renders pending child profiles', async () => {
    load.and.resolveTo([...children, { ...children[0], id: 'pending', firstName: 'Hidden', status: 'PendingApproval' }]);
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('.child-tabs')?.textContent).not.toContain('Hidden');
  });

  it('shows retry when child profiles cannot load', async () => {
    load.and.rejectWith(new Error('offline'));
    const fixture = TestBed.createComponent(FromYourKidsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("couldn't load");
    load.and.resolveTo(children);
    host.querySelector<HTMLButtonElement>('.retry')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.child-tabs')).not.toBeNull();
  });
});
