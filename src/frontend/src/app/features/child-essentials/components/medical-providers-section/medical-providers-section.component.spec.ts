import { TestBed } from '@angular/core/testing';
import { Api, Child, MedicalProvider } from '../../../../core/api/api';
import { MedicalProvidersSection } from './medical-providers-section.component';

const child = (id: string, firstName: string): Child => ({
  id,
  firstName,
  status: 'Active',
  changeRequestId: null,
  signIn: { enabled: false } as Child['signIn'],
});

describe('Medical provider contacts', () => {
  it('requires doctor contact details and saves the provider for the selected children', async () => {
    const addMedicalProvider = vi.fn(async (_family: string, _child: string, provider: MedicalProvider) => ({
      revision: 1, providers: [provider],
    }));
    TestBed.configureTestingModule({
      providers: [{ provide: Api, useValue: {
        medicalProviders: vi.fn(async () => ({ revision: 0, providers: [] })),
        addMedicalProvider,
      } }],
    });
    const fixture = TestBed.createComponent(MedicalProvidersSection);
    fixture.componentRef.setInput('familyId', 'family');
    fixture.componentRef.setInput('childId', 'first');
    fixture.componentRef.setInput('children', [child('first', 'Sam'), child('second', 'Jo')]);
    const el = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const field = (name: string) => el.querySelector<HTMLInputElement>(`[formcontrolname="${name}"]`)!;
    const enter = (name: string, value: string) => {
      field(name).value = value;
      field(name).dispatchEvent(new Event('input'));
    };
    await render();
    el.querySelector<HTMLButtonElement>('section > .primary')!.click();
    await render();

    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    enter('name', 'Dr. Reed');
    enter('phone', '512-555-0142');
    await render();
    expect(field('phone').required).toBe(true);
    expect(field('address').required).toBe(true);
    expect(submit.disabled).toBe(true);

    enter('address', '120 Example Lane');
    const [first, second] = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(first.checked).toBe(true);
    second.click();
    await render();
    expect(submit.disabled).toBe(false);
    submit.click();
    await render();

    expect(addMedicalProvider).toHaveBeenCalledWith('family', 'first', expect.objectContaining({
      type: 'Doctor', name: 'Dr. Reed', phone: '512-555-0142', address: '120 Example Lane',
    }), ['first', 'second']);
    expect(el.querySelector('a[href^="tel:"]')?.getAttribute('href')).toBe('tel:5125550142');
    expect(el.querySelector('a[target="_blank"]')?.getAttribute('href')).toContain('destination=120%20Example%20Lane');
  });

  function setup(medicalProviders: (family: string, childId: string) => Promise<unknown>) {
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: { medicalProviders: vi.fn(medicalProviders) } }] });
    const fixture = TestBed.createComponent(MedicalProvidersSection);
    fixture.componentRef.setInput('familyId', 'family');
    fixture.componentRef.setInput('childId', 'first');
    fixture.componentRef.setInput('children', [child('first', 'Sam'), child('second', 'Jo')]);
    const el = fixture.nativeElement as HTMLElement;
    const render = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, el, render };
  }

  it('makes phone and address required only for a doctor or dentist', async () => {
    const { el, render } = setup(async () => ({ revision: 0, providers: [] }));
    await render();
    el.querySelector<HTMLButtonElement>('section > .primary')!.click();
    await render();
    const field = (name: string) => el.querySelector<HTMLInputElement | HTMLSelectElement>(`[formcontrolname="${name}"]`)!;
    const submit = () => el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    field('name').value = 'Bright Eyes';
    field('name').dispatchEvent(new Event('input'));
    field('type').value = 'Optometrist';
    field('type').dispatchEvent(new Event('change'));
    await render();
    // Optional for an optometrist: the form can be saved without them.
    expect(submit().disabled).toBe(false);

    field('type').value = 'Dentist';
    field('type').dispatchEvent(new Event('change'));
    field('phone').dispatchEvent(new Event('blur'));
    field('address').dispatchEvent(new Event('blur'));
    await render();
    expect(submit().disabled).toBe(true);
    const alerts = Array.from(el.querySelectorAll('[role="alert"]'), alert => alert.textContent!.trim());
    expect(alerts).toContain('Enter a phone number for a doctor or dentist.');
    expect(alerts).toContain('Enter a practice address for a doctor or dentist.');
  });

  it('never shows one child’s providers under another child, even when an answer arrives late', async () => {
    const provider = (name: string): MedicalProvider => ({
      id: name, type: 'Other', name, specialty: null, practice: null, phone: null, address: null,
    });
    let answerFirst: (value: unknown) => void = () => undefined;
    let answerSecond: (value: unknown) => void = () => undefined;
    let calls = 0;
    const { fixture, el, render } = setup(() => new Promise(resolve => {
      calls++;
      if (calls === 1) resolve({ revision: 1, providers: [provider('Sam’s clinic')] });
      else if (calls === 2) answerFirst = resolve;
      else answerSecond = resolve;
    }));
    await render();
    expect(el.textContent).toContain('Sam’s clinic');

    // Back to the first child and on to the second before the first answer comes back.
    fixture.componentRef.setInput('childId', 'other');
    await render();
    fixture.componentRef.setInput('childId', 'second');
    await render();
    expect(el.textContent).not.toContain('Sam’s clinic');

    answerFirst({ revision: 1, providers: [provider('Wrong child’s clinic')] });
    await render();
    expect(el.textContent).not.toContain('Wrong child’s clinic');
    answerSecond({ revision: 1, providers: [provider('Jo’s clinic')] });
    await render();
    expect(el.textContent).toContain('Jo’s clinic');
  });
});
