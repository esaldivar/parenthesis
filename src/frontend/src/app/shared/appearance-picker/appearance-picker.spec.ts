import { TestBed } from '@angular/core/testing';
import { AppearanceService } from '../../core/theme/appearance.service';
import { AppearancePicker } from './appearance-picker';

describe('AppearancePicker', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function render() {
    const fixture = TestBed.createComponent(AppearancePicker);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('is a labelled radio group with Light, Dark and System, System selected by default', () => {
    const element = render();
    const group = element.querySelector('[role="radiogroup"]')!;

    expect(group.getAttribute('aria-labelledby')).toBe('appearance-heading');
    expect(element.querySelector('#appearance-heading')!.textContent).toBe('Appearance');
    const radios = [...element.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.labels![0].textContent!.trim())).toEqual(['Light', 'Dark', 'System']);
    expect(radios.find((r) => r.checked)!.labels![0].textContent!.trim()).toBe('System');
  });

  it('applies the chosen theme for the current person only', async () => {
    const appearance = TestBed.inject(AppearanceService);
    appearance.useAccount('parent-a');
    const element = render();

    element.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1].click();
    TestBed.tick();

    expect(appearance.preference()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('parenthesis.appearance.parent-a')).toBe('dark');
  });
});
