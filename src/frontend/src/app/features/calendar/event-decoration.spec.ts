import { TestBed } from '@angular/core/testing';
import { EventDecoration } from './event-decoration';
import { EventThemesService } from '../../core/theme/event-themes.service';

describe('EventDecoration', () => {
  it('updates artwork after title edits and removes it immediately when disabled', () => {
    const fixture = TestBed.createComponent(EventDecoration);
    fixture.componentRef.setInput('title', 'Birthday party');
    fixture.componentRef.setInput('palette', 'family');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-theme-motif')).toBe('party');
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
    fixture.componentRef.setInput('title', 'Beach day');
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('data-theme-motif')).toBe('beach');
    TestBed.inject(EventThemesService).setEnabled(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.art')).toBeNull();
  });
  it('renders nothing for hidden private details or unknown titles', () => {
    const fixture = TestBed.createComponent(EventDecoration);
    fixture.componentRef.setInput('title', 'Family dinner');
    fixture.componentRef.setInput('palette', 'unavailable');
    fixture.componentRef.setInput('allowed', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.art')).toBeNull();
    fixture.componentRef.setInput('allowed', true);
    fixture.componentRef.setInput('title', 'Appointment');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.art')).toBeNull();
  });
});
