import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EmergencyContactsSection } from './emergency-contacts-section';

describe('Emergency Contacts', () => {
  const url = '/api/families/family-1/children/child-1/essentials/emergency-contacts';

  async function render(contacts: unknown[] = []) {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const fixture = TestBed.createComponent(EmergencyContactsSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', 'child-1');
    fixture.componentRef.setInput('children', []);
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
    return { http, host, click, type };
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
});
