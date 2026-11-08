import { TestBed } from '@angular/core/testing';
import { Api, Child, MedicalProvider } from '../../core/api/api';
import { MedicalProvidersSection } from './medical-providers-section';

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
});
