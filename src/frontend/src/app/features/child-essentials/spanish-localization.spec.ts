import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api, Child } from '../../core/api/api';
import { LocaleService } from '../../core/i18n/locale.service';
import { translations } from '../../core/i18n/translations';
import { essentialsTranslations } from '../../core/i18n/essentials-translations';
import { fakeAuth } from '../../../testing/fake-auth';
import { ChildEssentialsPage } from './child-essentials-page';
import { AllergiesFoodSection } from './allergies-food-section';
import { ClothingSection } from './clothing-section';
import { WhatHelpsSection } from './what-helps-section';
import { SchoolSection } from './school-section';
import { RoutinesSection } from './routines-section';
import { EmergencyContactsSection } from './emergency-contacts-section';
import { CaregiversSection } from './caregivers-section';
import { MedicalProvidersSection } from './medical-providers-section';
import { bannerText, ESSENTIALS_SECTIONS } from './essentials-updates';

const child = { id: 'child', firstName: 'Sam', status: 'Active', changeRequestId: null, signIn: { enabled: false } } as Child;
const api = () => ({
  children: vi.fn(async () => [child]),
  school: vi.fn(async () => ({ revision: 0, values: { grade: 'Kindergarten', homeroomTeacher: null, parentConcerns: 'Keep my English notes' } })),
  clothing: vi.fn(async () => ({ revision: 0, values: { topSize: null, bottomSize: null, shoeSize: null, fitNotes: null } })),
  allergiesFood: vi.fn(async () => ({ revision: 0, values: { allergies: null, foodPreferences: null, noKnownAllergies: true } })),
  whatHelps: vi.fn(async () => ({ revision: 0, values: { comfortItems: null, calmingStrategies: null } })),
  routines: vi.fn(async () => ({ revision: 0, values: { bedtime: null, naps: null } })),
  householdRoutines: vi.fn(async () => []),
  emergencyContacts: vi.fn(async () => ({ version: 0, contacts: [] })),
  caregivers: vi.fn(async () => ({ version: 0, caregivers: [] })),
  medicalProviders: vi.fn(async () => ({ revision: 0, providers: [] })),
  essentialsUpdates: vi.fn(async () => ({ newUpdates: false, sections: [] })),
  essentialsOpened: vi.fn(async () => [{ childId: child.id, section: 'clothing', fields: ['shoeSize'] }]),
  essentialsSectionOpened: vi.fn(async () => undefined),
  essentialsRowsSeen: vi.fn(async () => undefined),
});

async function render<T>(component: Type<T>, service = api()) {
  TestBed.configureTestingModule({ providers: [provideRouter([]), fakeAuth(), { provide: Api, useValue: service }] });
  const locale = TestBed.inject(LocaleService);
  locale.setLocale('es-419');
  const fixture = TestBed.createComponent(component);
  if (component !== ChildEssentialsPage) {
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('childId', child.id);
    if ([MedicalProvidersSection, EmergencyContactsSection, CaregiversSection, AllergiesFoodSection].includes(component as Type<never>)) {
      fixture.componentRef.setInput('children', [child]);
    }
  }
  const settle = async () => { for (let i = 0; i < 5; i++) { fixture.detectChanges(); await fixture.whenStable(); } fixture.detectChanges(); };
  await settle();
  return { fixture, locale, settle, host: fixture.nativeElement as HTMLElement };
}

describe('Child Essentials Spanish (#577)', () => {
  afterEach(() => { localStorage.clear(); });

  it('translates every tile and update banner, and changes them back without refetching', async () => {
    const service = api();
    const { host, locale, settle } = await render(ChildEssentialsPage, service);
    expect(host.textContent).toContain('Información esencial de Sam');
    for (const [section, copy] of Object.entries(ESSENTIALS_SECTIONS)) {
      if (section !== 'householdRoutines' && section !== 'medical') {
        expect(host.querySelector(`[data-section="${section}"] summary`)?.textContent).toContain(translations[copy.name][1]);
      }
    }
    expect(host.textContent).toContain('Se actualizó talla de calzado de Sam');
    locale.setLocale('en'); await settle();
    expect(host.querySelector('[data-section="clothing"] summary')?.textContent).toContain('Clothing & Shoes');
    expect(service.children).toHaveBeenCalledTimes(1);
  });

  for (const [component, expected] of [
    [ClothingSection, 'Sin especificar'], [WhatHelpsSection, 'Sin especificar'],
    [RoutinesSection, 'Sin especificar'], [AllergiesFoodSection, 'Sin alergias conocidas'],
    [CaregiversSection, 'Aún no hay cuidadores compartidos'], [EmergencyContactsSection, 'Aún no hay contactos de emergencia'],
    [MedicalProvidersSection, 'Aún no se han agregado profesionales de salud'],
  ] as const) {
    it(`renders Spanish empty values in ${component.name}`, async () => {
      const { host } = await render(component as Type<unknown>);
      expect(host.textContent).toContain(expected);
      expect(host.textContent).not.toContain('Not set');
    });
  }

  it('localizes grade options and retains entered notes and draft when switching language', async () => {
    const { host, locale, settle } = await render(SchoolSection);
    expect(host.textContent).toContain('Kínder');
    expect(host.textContent).toContain('Keep my English notes');
    host.querySelector<HTMLButtonElement>('.actions button')!.click(); await settle();
    const grade = host.querySelector<HTMLSelectElement>('[formcontrolname="grade"]')!;
    expect(grade.value).toBe('Kindergarten');
    expect(grade.selectedOptions[0].textContent).toBe('Kínder');
    const notes = host.querySelector<HTMLTextAreaElement>('[formcontrolname="parentConcerns"]')!;
    notes.value = 'My unmodified draft'; notes.dispatchEvent(new Event('input'));
    locale.setLocale('en'); await settle();
    expect(grade.selectedOptions[0].textContent).toBe('Kindergarten');
    expect(notes.value).toBe('My unmodified draft');
  });

  it('localizes relationship choices while preserving their API values', async () => {
    const { host, settle } = await render(EmergencyContactsSection);
    host.querySelector<HTMLButtonElement>('section > button')!.click(); await settle();
    const option = host.querySelector<HTMLOptionElement>('option[value="Grandparent"]')!;
    expect(option.textContent).toBe('Abuelo o abuela');
    expect(option.value).toBe('Grandparent');
  });

  it('localizes provider types and validation, with stable API values', async () => {
    const { host, settle } = await render(MedicalProvidersSection);
    host.querySelector<HTMLButtonElement>('section > .primary')!.click(); await settle();
    expect(host.querySelector('option[value="Doctor"]')?.textContent).toBe('Médico');
    const phone = host.querySelector<HTMLInputElement>('[formcontrolname="phone"]')!;
    phone.dispatchEvent(new Event('blur')); await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('teléfono');
    expect(host.querySelector<HTMLSelectElement>('[formcontrolname="type"]')!.value).toBe('Doctor');
  });

  it('updates an already visible failure when language changes', async () => {
    const service = api(); service.clothing.mockRejectedValue(new Error('network'));
    const { host, locale, settle } = await render(ClothingSection, service);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('No se pudo');
    locale.setLocale('en'); await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('couldn');
    expect(service.clothing).toHaveBeenCalledTimes(1);
  });

  it('has both languages for every new key and keeps private banner values out', () => {
    for (const pair of Object.values(essentialsTranslations)) { expect(pair[0]).toBeTruthy(); expect(pair[1]).toBeTruthy(); }
    expect(bannerText('Sam', { childId: child.id, section: 'householdRoutines', fields: ['bedtime'] }, 'es-419'))
      .toBe('Se actualizó horario para dormir en el hogar del otro padre o madre de Sam');
  });
});
