import { TestBed } from '@angular/core/testing';
import { Logo } from './logo';

describe('Logo', () => {
  function render(inputs: Partial<{ variant: 'full' | 'mark'; markSize: number; decorative: boolean }> = {}) {
    const fixture = TestBed.createComponent(Logo);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('has one accessible name, "Parenthesis", not the split wordmark', () => {
    const host = render();

    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Parenthesis');
  });

  it('renders the two-tone wordmark with exact capitalisation', () => {
    const host = render();

    expect(host.querySelector('.parent')!.textContent).toBe('Parent');
    expect(host.querySelector('.hesis')!.textContent).toBe('hesis');
    expect(host.querySelector('.logo__wordmark')!.textContent).toBe('Parenthesis');
  });

  it('draws two caregiver curves around one child, using brand tokens rather than fixed colours', () => {
    const host = render();

    expect(host.querySelectorAll('.caregiver').length).toBe(2);
    expect(host.querySelectorAll('.child').length).toBe(1);
    expect(host.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('[fill^="#"], [stroke^="#"]')).toBeNull();
  });

  it('omits the rays at small sizes and shows them at navigation size and above', () => {
    expect(render({ markSize: 16 }).querySelector('.rays')).toBeNull();
    expect(render({ markSize: 24 }).querySelector('.rays')).not.toBeNull();
  });

  it('can be the icon alone', () => {
    expect(render({ variant: 'mark' }).querySelector('.logo__wordmark')).toBeNull();
  });

  it('can be hidden from assistive technology when nearby text names the link', () => {
    const host = render({ decorative: true });

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.getAttribute('aria-label')).toBeNull();
  });
});
