import { FlexibleConnectedPositionStrategy } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BottomNav, bottomNavClearance, installBottomNavClearance } from './bottom-nav-clearance';

@Component({
  imports: [BottomNav],
  template: `<nav appBottomNav aria-label="Main"><a href="#home">Home</a></nav>`,
})
class Shell {}

/** jsdom has no layout: give the navigation the box a phone would. */
function placeNav(nav: HTMLElement, top: number, height: number) {
  nav.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 320, width: 320, x: 0, y: top }) as DOMRect;
}

describe('bottom navigation clearance for nonmodal popups (#327)', () => {
  afterEach(() => {
    document.querySelectorAll('[data-bottom-nav], .cdk-overlay-backdrop').forEach((e) => e.remove());
  });

  it('measures the navigation that overlaps the screen, and nothing when there is none or it is hidden', () => {
    expect(bottomNavClearance()).toBe(0);

    const nav = document.createElement('nav');
    nav.setAttribute('data-bottom-nav', '');
    document.body.appendChild(nav);
    placeNav(nav, document.documentElement.clientHeight - 91, 91); // 57px bar + 34px safe-area inset
    expect(bottomNavClearance()).toBe(91);

    placeNav(nav, 0, 0); // display: none on desktop
    expect(bottomNavClearance()).toBe(0);
  });

  it('adds the navigation to every connected popup’s bottom margin, once', () => {
    // Fails loudly if a CDK upgrade renames the method the clearance relies on.
    const proto = FlexibleConnectedPositionStrategy.prototype as unknown as { _getViewportMarginBottom: () => number };
    expect(typeof proto._getViewportMarginBottom).toBe('function');

    installBottomNavClearance();
    installBottomNavClearance();
    const strategy = Object.create(FlexibleConnectedPositionStrategy.prototype) as { _viewportMargin: number } & typeof proto;
    strategy._viewportMargin = 8; // what Material's date picker sets

    expect(strategy._getViewportMarginBottom()).toBe(8);
    const nav = document.createElement('nav');
    nav.setAttribute('data-bottom-nav', '');
    document.body.appendChild(nav);
    placeNav(nav, document.documentElement.clientHeight - 57, 57);
    expect(strategy._getViewportMarginBottom()).toBe(8 + 57);
  });

  it('never locks a popup to the side it opened on, so it can flip above the navigation later', () => {
    installBottomNavClearance();
    const strategy = Object.create(FlexibleConnectedPositionStrategy.prototype) as { _positionLocked: boolean; withLockedPosition(locked?: boolean): unknown };
    strategy.withLockedPosition(true);
    expect(strategy._positionLocked).toBe(false);
  });

  it('closes open nonmodal popups when the navigation is used, but leaves modal dialogs alone', () => {
    const fixture = TestBed.createComponent(Shell);
    fixture.detectChanges();
    const transparent = document.createElement('div');
    transparent.className = 'cdk-overlay-backdrop cdk-overlay-transparent-backdrop';
    const picker = document.createElement('div');
    picker.className = 'cdk-overlay-backdrop mat-overlay-transparent-backdrop';
    const modal = document.createElement('div');
    modal.className = 'cdk-overlay-backdrop cdk-overlay-dark-backdrop';
    document.body.append(transparent, picker, modal);
    const closedPopup = vi.fn();
    const closedDialog = vi.fn();
    transparent.addEventListener('click', closedPopup);
    picker.addEventListener('click', closedPopup);
    modal.addEventListener('click', closedDialog);

    (fixture.nativeElement as HTMLElement).querySelector('a')!.click();

    expect(closedPopup).toHaveBeenCalledTimes(2);
    expect(closedDialog).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).querySelector('nav')!.hasAttribute('data-bottom-nav')).toBe(true);
  });
});
