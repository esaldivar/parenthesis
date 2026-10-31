import { TestBed } from '@angular/core/testing';
import { LoadingIndicator } from './loading-indicator';

describe('branded operation status (#413)', () => {
  it('announces a stable label while progress changes and clears on completion', () => {
    const fixture = TestBed.createComponent(LoadingIndicator);
    fixture.componentRef.setInput('label', 'Uploading photo…');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const status = el.querySelector('[role=status]')!;
    expect(status.textContent).toBe('Uploading photo…');
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('[role=progressbar]')).toBeNull();
    fixture.componentRef.setInput('progress', 42.4);
    fixture.detectChanges();
    expect(el.querySelector('[role=progressbar]')!.getAttribute('aria-valuenow')).toBe('42');
    expect(el.querySelector('[role=progressbar]')!.hasAttribute('aria-live')).toBe(false);
    expect(el.querySelector('[role=status]')).toBe(status);
    expect(status.textContent).toBe('Uploading photo…');
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    expect(status.textContent).toBe('');
    expect(el.querySelector('svg, [role=progressbar]')).toBeNull();
  });
});
