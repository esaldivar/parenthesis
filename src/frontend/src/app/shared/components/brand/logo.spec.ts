import { TestBed } from '@angular/core/testing';
import { Logo } from './logo';

describe('Logo (approved icon, wordmark asset pending)', () => {
  function render(decorative = false) {
    const fixture = TestBed.createComponent(Logo);
    fixture.componentRef.setInput('decorative', decorative);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('uses the approved icon file unchanged and draws nothing itself (BRANDING.md)', () => {
    const host = render();
    const icon = host.querySelector('img')!;

    expect(icon.getAttribute('src')).toBe('/brand/parenthesis-icon.svg');
    expect(icon.getAttribute('alt')).toBe(''); // The host carries the name.
    expect(host.querySelector('svg, canvas')).toBeNull();
    expect(host.getAttribute('data-asset-status')).toBe('wordmark-pending');
  });

  it('shows the Option B wordmark text with exact capitalisation', () => {
    const host = render();

    expect(host.querySelector('.parent')!.textContent).toBe('Parent');
    expect(host.querySelector('.hesis')!.textContent).toBe('hesis');
    expect(host.textContent).toBe('Parenthesis');
  });

  it('has one accessible name, "Parenthesis"', () => {
    const host = render();

    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Parenthesis');
  });

  it('can be hidden from assistive technology when nearby text names the link', () => {
    const host = render(true);

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
  });
});
