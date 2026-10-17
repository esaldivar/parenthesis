import { TestBed } from '@angular/core/testing';
import { Logo } from './logo';

describe('Logo (asset pending)', () => {
  function render(decorative = false) {
    const fixture = TestBed.createComponent(Logo);
    fixture.componentRef.setInput('decorative', decorative);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('does not draw an icon: the approved artwork may not be approximated (BRANDING.md)', () => {
    const host = render();

    expect(host.querySelector('svg, img, canvas')).toBeNull();
    expect(host.getAttribute('data-asset-status')).toBe('pending');
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
