import { TestBed } from '@angular/core/testing';
import { EventThemesService } from './event-themes.service';
describe('EventThemesService', () => {
  beforeEach(() => localStorage.clear());
  it('defaults On and isolates accounts', () => {
    const service = TestBed.inject(EventThemesService);
    service.useAccount('a');
    expect(service.enabled()).toBe(true);
    service.setEnabled(false);
    service.useAccount('b');
    expect(service.enabled()).toBe(true);
    service.useAccount('a');
    expect(service.enabled()).toBe(false);
    service.useAccount(null);
    expect(service.enabled()).toBe(true);
  });
});
