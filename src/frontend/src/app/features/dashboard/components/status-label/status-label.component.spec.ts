import { TestBed } from '@angular/core/testing';
import { LocaleService } from '../../../../core/i18n/locale.service';
import { StatusLabel } from './status-label.component';

describe('StatusLabel', () => {
  afterEach(() => TestBed.inject(LocaleService).setLocale('en'));

  function label(status: 'confirmed' | 'proposed' | 'rejected' | 'change-pending'): string {
    const fixture = TestBed.createComponent(StatusLabel);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent.trim();
  }

  it('names each status in words', () => {
    expect(['confirmed', 'proposed', 'rejected', 'change-pending'].map((status) => label(status as never)))
      .toEqual(['Confirmed', 'Proposed', 'Rejected', 'Change pending']);
  });

  it('follows the viewer’s language (#534)', () => {
    TestBed.inject(LocaleService).setLocale('es-419');
    expect(['confirmed', 'proposed', 'rejected', 'change-pending'].map((status) => label(status as never)))
      .toEqual(['Confirmado', 'Propuesto', 'Rechazado', 'Cambio pendiente']);
  });
});
