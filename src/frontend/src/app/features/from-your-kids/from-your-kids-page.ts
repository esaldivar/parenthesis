import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

/**
 * M4 parent-facing presentation shell (#531). No synthetic child data is exposed to parents.
 * M5 will supply parent-authorized entries, artwork and photos through an API.
 */
@Component({
  selector: 'app-from-your-kids-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="kids" aria-labelledby="kids-title">
      <header class="intro">
        <h1 id="kids-title">From Your Kids</h1>
        <p>A little window into the things your children choose to share.</p>
      </header>

      <nav class="sections" aria-label="From Your Kids sections">
        <button type="button" [attr.aria-current]="section() === 'diary' ? 'page' : null"
          (click)="section.set('diary')"><span aria-hidden="true">📖</span> Diary</button>
        <button type="button" [attr.aria-current]="section() === 'artwork' ? 'page' : null"
          (click)="section.set('artwork')"><span aria-hidden="true">🎨</span> Artwork</button>
        <button type="button" [attr.aria-current]="section() === 'photos' ? 'page' : null"
          (click)="section.set('photos')"><span aria-hidden="true">📷</span> Photos</button>
      </nav>

      @switch (section()) {
        @case ('diary') {
          <section class="book" aria-labelledby="diary-title">
            <div class="page">
              <h2 id="diary-title">Their diary</h2>
              <p>Thoughts, feelings and stories shared just with you.</p>
            </div>
            <div class="page">
              <p class="empty">No diary entries shared with you yet.</p>
              <p class="hint">When your child shares an entry, you'll be able to turn its pages here.</p>
            </div>
          </section>
        }
        @case ('artwork') {
          <section class="gallery" aria-labelledby="artwork-title">
            <h2 id="artwork-title">Their artwork</h2>
            <div class="fridge">
              <img src="/art/from-your-kids-closed-fridge.svg" alt="A closed refrigerator with drawings attached to the outside" />
              <p>No artwork shared with you yet.</p>
            </div>
            <p class="hint">Drawings will appear on the outside of the fridge, held up by magnets.</p>
          </section>
        }
        @case ('photos') {
          <section class="gallery" aria-labelledby="photos-title">
            <h2 id="photos-title">Their photos</h2>
            <div class="corkboard"><p>No photos shared with you yet.</p></div>
            <p class="hint">Your child's photos will be pinned here like little memories.</p>
          </section>
        }
      }
    </section>
  `,
  styles: `
    :host { display: block; color: var(--color-text); }
    .kids { display: grid; gap: var(--space-4); max-width: 75rem; }
    h1,h2,p { margin: 0; }
    .intro { padding: var(--space-4); border-radius: var(--radius-card); background: var(--color-surface); }
    .intro h1 { font-family: Georgia, serif; font-size: clamp(1.7rem, 4vw, 2.6rem); }
    .intro p,.hint { color: var(--color-text-secondary); }
    .intro p { margin-top: var(--space-2); }
    .sections { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: var(--space-2); }
    .sections button { min-height: var(--target-min); padding: var(--space-3); border: 1px solid var(--color-divider); border-radius: var(--radius-card); background: var(--color-surface); color: var(--color-text); cursor: pointer; font: inherit; font-weight: 650; }
    .sections button[aria-current='page'] { border: 2px solid var(--color-focus); background: var(--color-surface-soft); }
    .sections button span { display: block; font-size: 1.7rem; }
    button:focus-visible { outline: 3px solid var(--color-focus); outline-offset: 3px; }
    .book { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); border: 6px solid #5E8F7E; border-radius: 16px; background: #F7F5ED; color: #20303F; box-shadow: 0 8px 20px #0002; overflow: hidden; }
    .page { min-height: 18rem; padding: clamp(1rem,3vw,2rem); background: repeating-linear-gradient(#fff9ed,#fff9ed 30px,#e5ded1 31px); }
    .page + .page { border-left: 2px solid #d6cbb9; }
    .page h2 { font-family: Georgia, serif; margin-bottom: 1rem; }
    .page .empty { font-weight: 700; margin-top: 2rem; }
    .gallery { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-4); background: var(--color-surface); border-radius: var(--radius-card); text-align: center; }
    .fridge img { display: block; width: min(100%, 21rem); max-height: 28rem; margin: auto; }
    .fridge p { margin-top: var(--space-2); }
    .corkboard { display: grid; place-items: center; width: min(100%,42rem); min-height: 16rem; border: 12px solid #996638; border-radius: 12px; background: #c48c55; color: #20303F; box-shadow: inset 0 0 12px #56351855; }
    .corkboard p { padding: 1rem; background: #F7F5ED; transform: rotate(-2deg); }
    @media (max-width: 40rem) { .book { grid-template-columns: 1fr; } .page:first-child { display: none; } .page + .page { border-left: 0; } .sections button { padding: var(--space-2); } }
    @media (prefers-reduced-motion: reduce) { *,*::before,*::after { transition: none !important; animation: none !important; } }
  `,
})
export class FromYourKidsPage {
  protected readonly section = signal<'diary' | 'artwork' | 'photos'>('diary');
}
