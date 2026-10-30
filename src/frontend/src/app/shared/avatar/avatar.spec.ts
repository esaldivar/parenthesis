import { TestBed } from '@angular/core/testing';
import { Avatar } from './avatar';

describe('Profile images (#388)', () => {
  function render(src: string | null = null, calendar = false) {
    const fixture = TestBed.createComponent(Avatar);
    fixture.componentRef.setInput('name', ' Kai');
    fixture.componentRef.setInput('src', src);
    fixture.componentRef.setInput('calendar', calendar);
    fixture.detectChanges();
    return fixture;
  }

  it('keeps a first-letter fallback when no image is selected', () => {
    const host = render().nativeElement as HTMLElement;
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent?.trim()).toBe('K');
  });

  it('falls back after a failed image and can show a later replacement', () => {
    const fixture = render('/api/profile-images/first');
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector('img')!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent?.trim()).toBe('K');
    fixture.componentRef.setInput('src', '/api/profile-images/replacement');
    fixture.detectChanges();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/api/profile-images/replacement');
    fixture.componentRef.setInput('src', null);
    fixture.detectChanges();
    expect(host.querySelector('img')).toBeNull();
  });

  it('marks calendar images for responsive suppression without marking picker or account images', () => {
    const calendar = render('/api/profile-images/child', true).nativeElement as HTMLElement;
    const profile = render('/api/profile-images/child').nativeElement as HTMLElement;
    expect(calendar.getAttribute('data-calendar')).toBe('true');
    expect(profile.hasAttribute('data-calendar')).toBe(false);
    expect(calendar.querySelector('img')?.getAttribute('alt')).toBe('');
    expect(profile.getAttribute('aria-hidden')).toBe('true');
  });
});
