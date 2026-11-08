import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EmergencyContactsSection } from './emergency-contacts-section';

describe('Emergency Contacts', () => {
  const url = '/api/families/family-1/children/child-1/essentials/emergency-contacts';

  async function render(contacts: unknown[] = [], children: unknown[] = []) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(EmergencyContactsSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.componentRef.setInput('children', children);
    const http = TestBed.inject(HttpTestingController);
    const host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url }).flush({ version: 3, contacts });
    await fixture.whenStable();
    fixture.detectChanges();
    const click = (label: string) => {
      [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label)!.click();
      fixture.detectChanges();
    };
    const type = (selector: string, value: string, event = 'input') => {
      const field = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector)!;
      field.value = value;
      field.dispatchEvent(new Event(event, { bubbles: true }));
      fixture.detectChanges();
    };
    return { http, host, click, type, fixture };
  }

  it('offers common relationships to choose from instead of typing one', async () => {
    const { http, host, click, type } = await render();

    click('Add emergency contact');
    const options = [...host.querySelectorAll('select[formcontrolname="relationshipKind"] option')].map((o) => o.textContent.trim());
    expect(options).toEqual([
      'Choose a relationship', 'Grandparent', 'Aunt', 'Uncle', 'Sibling', 'Other relative', 'Family friend', 'Neighbor', 'Other',
    ]);
    expect(host.querySelector('input[formcontrolname="relationship"]')).toBeNull();
    type('input[formcontrolname="name"]', 'Jordan Lee');
    type('input[formcontrolname="phone"]', '555-733-5189');
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    type('select[formcontrolname="relationshipKind"]', 'Grandparent', 'change');
    click('Save contact');

    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.contacts).toEqual([expect.objectContaining({ name: 'Jordan Lee', relationship: 'Grandparent' })]);
    http.verify();
  });

  it('asks for the parent’s own words under Other, and keeps an older typed relationship there', async () => {
    const { http, host, click, type } = await render([
      { id: 'c1', name: 'Riley Carter', relationship: 'Godparent', phone: '555-284-9016', address: null, callFirst: false },
    ]);

    click('Edit');
    expect(host.querySelector<HTMLSelectElement>('select[formcontrolname="relationshipKind"]')!.value).toBe('Other');
    const words = host.querySelector<HTMLInputElement>('input[formcontrolname="relationship"]')!;
    expect(words.value).toBe('Godparent');
    type('input[formcontrolname="relationship"]', '  ');
    expect(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    type('input[formcontrolname="relationship"]', 'Soccer coach');
    click('Save contact');

    const save = http.expectOne({ method: 'PUT', url });
    expect(save.request.body.contacts).toEqual([expect.objectContaining({ id: 'c1', relationship: 'Soccer coach' })]);
    http.verify();
  });
  it('adds to all children, preserves Call first, and retries only missing contacts', async () => {
    const { http, host, click, type, fixture } = await render([], [{ id: 'child-2', firstName: 'Taylor' }]);
    const siblingUrl = url.replace('child-1', 'child-2');
    const existing = { id: 'c2', name: 'Morgan Lee', relationship: 'Aunt', phone: '512-555-0101', address: null, callFirst: true };
    const added = { id: 'c1', name: 'Jordan Lee', relationship: 'Grandparent', phone: '512-555-0100', address: null, callFirst: true };
    click('Add emergency contact');
    type('input[formcontrolname="name"]', added.name);
    type('input[formcontrolname="phone"]', added.phone);
    type('select[formcontrolname="relationshipKind"]', added.relationship, 'change');
    host.querySelector<HTMLInputElement>('input[formcontrolname="callFirst"]')!.click();
    host.querySelector<HTMLInputElement>('input[formcontrolname="addToAll"]')!.click();
    click('Save contact');
    http.expectOne({ method: 'GET', url }).flush({ version: 3, contacts: [] });
    await Promise.resolve();
    const current = http.expectOne({ method: 'PUT', url });
    expect(current.request.body.contacts).toEqual([{ ...added, id: null }]);
    current.flush({ version: 4, contacts: [added] });
    await Promise.resolve();
    await vi.waitFor(() => http.expectOne({ method: 'GET', url: siblingUrl }).flush({ version: 5, contacts: [existing] }));
    await Promise.resolve();
    const failed = http.expectOne({ method: 'PUT', url: siblingUrl });
    expect(failed.request.body.contacts).toEqual([existing, { ...added, id: null, callFirst: false }]);
    failed.flush({}, { status: 500, statusText: 'Failed' });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Taylor');
    });

    click('Save contact');
    http.expectOne({ method: 'GET', url }).flush({ version: 4, contacts: [added] });
    await Promise.resolve();
    http.expectNone({ method: 'PUT', url });
    await vi.waitFor(() => http.expectOne({ method: 'GET', url: siblingUrl }).flush({ version: 5, contacts: [existing] }));
    await Promise.resolve();
    const retried = http.expectOne({ method: 'PUT', url: siblingUrl });
    expect(retried.request.body.contacts).toEqual([existing, { ...added, id: null, callFirst: false }]);
    retried.flush({ version: 6, contacts: [existing, { ...added, callFirst: false }] });
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.textContent).toContain('Emergency contact saved for all children.');
    });
    http.verify();
  });
});
