import { InteractivityChecker } from '@angular/cdk/a11y';
import { TestBed } from '@angular/core/testing';
import { KidsGalleryItem } from '../../from-your-kids-contract';
import { KidsGallery } from './kids-gallery.component';

describe('KidsGallery (#531)', () => {
  function render(includeSecondPage = false) {
    const fixture = TestBed.createComponent(KidsGallery);
    const now = Date.now();
    const item = (id: string, offset: number, expiresAt: string | null, bookmarked = false): KidsGalleryItem => ({
      id, childId: 'sample-child', kind: 'Artwork', createdAt: new Date(now + offset).toISOString(),
      visibleToViewer: true, imageUrl: '/sample.svg', thumbnailUrl: '/sample.svg',
      altText: id, expiresAt, bookmarked, heartedByViewer: false, viewerComment: null, downloadUrl: null,
    });
    fixture.componentRef.setInput('kind', 'Artwork');
    fixture.componentRef.setInput('items', [
      item('older saved drawing', -5000, null, true),
      item('newer drawing', -1000, new Date(now + 3_600_000).toISOString()),
      item('expired drawing', -10000, new Date(now - 1000).toISOString()),
      item('unsaved drawing without an expiry', -15000, null),
      item('two-day drawing', -20000, new Date(now + 90_000_000).toISOString()),
      ...(includeSecondPage ? [item('oldest drawing', -25000, null)] : []),
    ]);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('orders thumbnails by creation time and identifies retention states', () => {
    const { host } = render();
    const labels = [...host.querySelectorAll('.memory')].map(button => button.getAttribute('aria-label'));
    expect(labels).toEqual([
      'View newer drawing, Expires in 1 day',
      'View older saved drawing, Saved',
      'View expired drawing, Expired',
      'View unsaved drawing without an expiry, Unsaved',
      'View two-day drawing, Expires in 2 days',
    ]);
    expect([...host.querySelectorAll('.fridge-door .retention')].map(label => label.textContent?.trim()))
      .toEqual(['Expires in 1 day', 'Saved']);
    expect([...host.querySelectorAll('.artwork-grid .retention')].map(label => label.textContent?.trim()))
      .toEqual(['Expired', 'Unsaved', 'Expires in 2 days']);
    expect(host.querySelector('.artwork-pager')).toBeNull();
  });

  it('shows older drawings on the next page and returns to the newest drawings', () => {
    const { fixture, host } = render(true);
    const pager = host.querySelector('.artwork-pager')!;
    const [previous, next] = pager.querySelectorAll('button');
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(host.querySelectorAll('.memory')).toHaveLength(5);

    next.click();
    fixture.detectChanges();
    expect(pager.textContent).toContain('2 / 2');
    expect(previous.disabled).toBe(false);
    expect(next.disabled).toBe(true);
    expect(host.querySelectorAll('.memory')).toHaveLength(1);
    expect(host.querySelector('.fridge-door .memory')?.getAttribute('aria-label')).toBe('View oldest drawing, Unsaved');

    previous.click();
    fixture.detectChanges();
    expect(pager.textContent).toContain('1 / 2');
    expect(host.querySelectorAll('.memory')).toHaveLength(5);
    expect(host.querySelector('.fridge-door .memory')?.getAttribute('aria-label')).toBe('View newer drawing, Expires in 1 day');
  });

  it('focuses the preview, closes on Escape, and restores focus to the originating thumbnail', async () => {
    // jsdom does not calculate layout, which the CDK uses to detect visible controls.
    const checker = TestBed.inject(InteractivityChecker);
    vi.spyOn(checker, 'isFocusable').mockImplementation(element => element instanceof HTMLButtonElement);
    vi.spyOn(checker, 'isTabbable').mockImplementation(element => element instanceof HTMLButtonElement);
    const { fixture, host } = render();
    const thumbnail = host.querySelector<HTMLButtonElement>('.memory')!;
    thumbnail.focus();
    thumbnail.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const close = host.querySelector<HTMLButtonElement>('[aria-label="Close preview"]')!;
    await vi.waitFor(() => expect(document.activeElement).toBe(close));
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Expires in 1 day');
    close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(thumbnail);
  });
});
