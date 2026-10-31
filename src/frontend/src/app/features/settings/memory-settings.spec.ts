import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Toasts } from '../../shared/toast/toasts';
import { axeViolations } from '../../../testing/axe';
import { MemorySettingsSection } from './memory-settings';

// Synthetic family only.
const PATH = '/api/families/family-1/memories/settings';
const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Settings → Memories (#403)', () => {
  let http: HttpTestingController;
  let toasts: string[];

  async function settle(fixture: ComponentFixture<unknown>) {
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render() {
    toasts = [];
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Toasts).show = (message: string) => void toasts.push(message);
    const fixture = TestBed.createComponent(MemorySettingsSection);
    fixture.componentRef.setInput('familyId', 'family-1');
    fixture.componentRef.setInput('coParent', 'Sam');
    fixture.detectChanges();
    http.expectOne(PATH).flush({ allowCoParentDownload: false, storageUsedBytes: 38_000_000, storageLimitBytes: 250_000_000 });
    await settle(fixture);
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => http.verify());

  it('shows this parent’s storage, and downloads off by default with what the switch does and doesn’t do', async () => {
    const { el } = await render();

    expect(text(el)).toContain('Your photo storage 38 MB of 250 MB used');
    const meter = el.querySelector('[role=meter]')!;
    expect(meter.getAttribute('aria-valuetext')).toBe('38 MB of 250 MB used');
    const toggle = el.querySelector<HTMLButtonElement>('[role=switch]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(text(el.querySelector('#memory-download-help'))).toContain(
      'When this is on, Sam can download the photos you’ve shared with them. When it’s off, they can still view them.',
    );
    expect(text(el.querySelector('#memory-download-help'))).toContain('copies already saved can’t be recalled');
    expect(await axeViolations(el)).toEqual([]);
  });

  it('saves the switch for this parent only', async () => {
    const { fixture, el } = await render();

    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await settle(fixture);
    const put = http.expectOne(PATH);
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ allowCoParentDownload: true });
    put.flush({ allowCoParentDownload: true, storageUsedBytes: 38_000_000, storageLimitBytes: 250_000_000 });
    await settle(fixture);

    expect(toasts).toEqual(['Sam can now download the photos you share.']);
    expect(el.querySelector('[role=switch]')!.getAttribute('aria-checked')).toBe('true');
  });

  it('puts the switch back and says so when saving fails', async () => {
    const { fixture, el } = await render();

    el.querySelector<HTMLButtonElement>('[role=switch]')!.click();
    await settle(fixture);
    http.expectOne(PATH).error(new ProgressEvent('error'), { status: 0 });
    await settle(fixture);

    expect(text(el.querySelector('[role=alert]'))).toContain('Check your connection');
    expect(el.querySelector('[role=switch]')!.getAttribute('aria-checked')).toBe('false');
    expect(toasts).toEqual([]);
  });
});
