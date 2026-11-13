import { LocaleService } from '../../../../core/i18n/locale.service';
import { TranslatePipe, TranslationKey } from '../../../../core/i18n/translations';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

type Bilingual = readonly [english: string, spanish: string];

/** One cookie or browser storage item, as listed in docs/privacy/data-inventory.md. */
interface StoredItem {
  readonly name: string;
  readonly kind: 'Cookie' | 'Browser storage' | 'Tab storage';
  /** English, then Spanish (#534). */
  readonly purpose: Bilingual;
  readonly lasts: Bilingual;
}

/**
 * Everything Parenthesis keeps in a browser. Each entry is needed to run the service or remembers a choice the person
 * made, so there is no consent banner (#416). Keep in step with docs/privacy/data-inventory.md and
 * storage-inventory.spec.ts, which fails when the code uses a key that isn't listed here.
 */
export const STORED_ITEMS: readonly StoredItem[] = [
  {
    name: '__Host-parenthesis',
    kind: 'Cookie',
    purpose: ['Keeps you signed in.', 'Mantiene tu sesión iniciada.'],
    lasts: ['14 days after your last visit, or until you sign out.', '14 días después de tu última visita, o hasta que cierres sesión.'],
  },
  {
    name: '__Host-parenthesis-af',
    kind: 'Cookie',
    purpose: ['Protects your account from forged requests from other sites.', 'Protege tu cuenta de solicitudes falsificadas desde otros sitios.'],
    lasts: ['Until you close the browser.', 'Hasta que cierres el navegador.'],
  },
  {
    name: 'XSRF-TOKEN',
    kind: 'Cookie',
    purpose: ['Works with the cookie above to protect your account from forged requests.', 'Funciona con la cookie anterior para proteger tu cuenta de solicitudes falsificadas.'],
    lasts: ['Until you close the browser.', 'Hasta que cierres el navegador.'],
  },
  {
    name: '__Host-parenthesis-device',
    kind: 'Cookie',
    purpose: ['Recognizes a shared family device or a child’s tablet that a parent registered.', 'Reconoce un dispositivo familiar compartido o la tableta de un niño que registró un padre o madre.'],
    lasts: ['30 days for a shared device, about 400 days for a child’s tablet, or until a parent removes it.', '30 días para un dispositivo compartido, unos 400 días para la tableta de un niño, o hasta que un padre o madre lo quite.'],
  },
  {
    name: 'parenthesis.locale',
    kind: 'Browser storage',
    purpose: ['Your language choice before signing in.', 'Tu idioma elegido antes de iniciar sesión.'],
    lasts: ['Until you clear it.', 'Hasta que lo borres.'],
  },
  {
    name: 'parenthesis.locale.account.…',
    kind: 'Browser storage',
    purpose: ['Remembers each signed-in parent’s language choice on this device; the account also saves the preference.', 'Recuerda el idioma de cada padre o madre con sesión iniciada en este dispositivo; la cuenta también guarda la preferencia.'],
    lasts: ['Until you clear it.', 'Hasta que lo borres.'],
  },
  {
    name: 'parenthesis.appearance.…',
    kind: 'Browser storage',
    purpose: ['Your light, dark or system appearance choice.', 'Tu apariencia elegida: clara, oscura o la del sistema.'],
    lasts: ['Until you clear it.', 'Hasta que lo borres.'],
  },
  {
    name: 'parenthesis.event-themes.…',
    kind: 'Browser storage',
    purpose: ['Whether you want themes on events.', 'Si quieres temas en los eventos.'],
    lasts: ['Until you clear it.', 'Hasta que lo borres.'],
  },
  {
    name: 'parenthesis.calendar-filters.…',
    kind: 'Browser storage',
    purpose: ['The calendar filters you chose.', 'Los filtros del calendario que elegiste.'],
    lasts: ['Until you reset the filters or clear it.', 'Hasta que restablezcas los filtros o lo borres.'],
  },
  {
    name: 'parenthesis.sharedDevice.declined:…',
    kind: 'Browser storage',
    purpose: ['Remembers that you said this isn’t a shared family device, so we don’t ask at every sign-in.', 'Recuerda que indicaste que este no es un dispositivo familiar compartido, para no preguntarte cada vez que inicias sesión.'],
    lasts: ['Until you clear it or set the device up as shared.', 'Hasta que lo borres o configures el dispositivo como compartido.'],
  },
  {
    name: 'parenthesis.pendingInvitation',
    kind: 'Browser storage',
    purpose: ['Keeps a co-parent invitation while you create your account.', 'Guarda la invitación del otro padre o madre mientras creas tu cuenta.'],
    lasts: ['Until it’s used, or 7 days at most.', 'Hasta que se use, o 7 días como máximo.'],
  },
  {
    name: 'parenthesis.parentPinReset',
    kind: 'Tab storage',
    purpose: ['Keeps a parent PIN reset link while you choose a new PIN.', 'Guarda el enlace para restablecer el PIN de padre o madre mientras eliges un PIN nuevo.'],
    lasts: ['Until it’s used or you close the tab.', 'Hasta que se use o cierres la pestaña.'],
  },
  {
    name: 'parenthesis.pickerSetAside',
    kind: 'Tab storage',
    purpose: ['After a parent signs out of another parent’s shared device, keeps this tab on sign-in instead of that device’s profiles.', 'Cuando un padre o madre cierra sesión en el dispositivo compartido del otro, mantiene esta pestaña en el inicio de sesión en lugar de mostrar los perfiles de ese dispositivo.'],
    lasts: ['Until someone signs in again or you close the tab.', 'Hasta que alguien vuelva a iniciar sesión o cierres la pestaña.'],
  },
];

/**
 * The public Privacy Notice (#416). It must describe what the app does today: check docs/privacy/data-inventory.md and
 * update both together when collection, sharing, storage or retention changes.
 */
@Component({
  imports: [TranslatePipe],
  selector: 'app-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="notice">
      <h1>{{ 'feature.privacy.notice' | tr }}</h1>
      <p class="muted">{{ 'privacy.lastUpdated' | tr }}</p>

      <p>
        {{ 'feature.parenthesis.helps.separated.parents.share.a.family' | tr }}
      </p>

      <nav aria-labelledby="contents-heading">
        <h2 id="contents-heading" class="contents-heading">{{ 'feature.on.this.page' | tr }}</h2>
        <ul class="contents">
          @for (section of sections; track section.id) {
            <li>
              <a [href]="'/privacy#' + section.id">{{ section.title | tr }}</a>
            </li>
          }
        </ul>
      </nav>

      <section aria-labelledby="who">
        <h2 id="who">{{ 'feature.who.we.are' | tr }}</h2>
        <p>
          {{ 'feature.parenthesis.is.run.by.eric.saldivar.an' | tr }}
          <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a>.
        </p>
      </section>

      <section aria-labelledby="collect">
        <h2 id="collect">{{ 'feature.what.we.collect' | tr }}</h2>
        <h3>{{ 'feature.about.parents' | tr }}</h3>
        <ul>
          <li>
            {{ 'feature.your.name.email.address.and.password.we' | tr }}
          </li>
          <li>{{ 'feature.a.profile.photo.if.you.add.one' | tr }}</li>
          <li>
            {{ 'feature.your.family.its.name.and.time.zone' | tr }}
          </li>
          <li>
            {{ 'feature.what.you.add.to.the.family.calendar' | tr }}
          </li>
          <li>
            {{ 'feature.event.photos.you.upload.we.remove.location' | tr }}
          </li>
          <li>
            {{ 'feature.the.names.of.devices.you.register.such' | tr }}
          </li>
        </ul>
        <h3>{{ 'feature.about.how.the.service.is.used' | tr }}</h3>
        <ul>
          <li>
            {{ 'feature.a.security.record.of.important.actions.for' | tr }}
          </li>
          <li>{{ 'feature.technical.logs.from.our.hosting.used.to' | tr }}</li>
          <li>
            {{ 'feature.your.ip.address.used.for.a.few' | tr }}
          </li>
        </ul>
        <p>
          {{ 'feature.we.don.t.use.analytics.advertising.or' | tr }}
        </p>
      </section>

      <section aria-labelledby="children">
        <h2 id="children">{{ 'feature.children.s.information' | tr }}</h2>
        <p>
          {{ 'feature.children.including.children.under.13.use.parenthesis' | tr }}
        </p>
        <ul>
          <li>
            {{ 'feature.we.keep.a.child.s.first.name' | tr }}
          </li>
          <li>
            {{ 'feature.we.collect.children.s.information.from.their' | tr }}
          </li>
          <li>
            {{ 'feature.children.never.see.ads.and.their.information' | tr }}
          </li>
          <li>
            {{ 'feature.a.parent.can.see.and.change.their' | tr }}
          </li>
          <li>{{ 'privacy.children.essentials' | tr }}</li>
        </ul>
      </section>

      <section aria-labelledby="health">
        <h2 id="health">{{ 'privacy.health.title' | tr }}</h2>
        <p>{{ 'privacy.health.what' | tr }}</p>
        <ul>
          <li>{{ 'privacy.health.who' | tr }}</li>
          <li>{{ 'privacy.health.reference' | tr }}</li>
          <li>{{ 'privacy.health.confirm' | tr }}</li>
          <li>{{ 'privacy.health.pdf' | tr }}</li>
          <li>{{ 'privacy.health.delete' | tr }}</li>
        </ul>
      </section>

      <section aria-labelledby="use">
        <h2 id="use">{{ 'feature.how.we.use.information' | tr }}</h2>
        <ul>
          <li>
            {{ 'feature.to.run.parenthesis.show.your.family.calendar' | tr }}
          </li>
          <li>
            {{ 'feature.to.send.account.emails.such.as.confirming' | tr }}
          </li>
          <li>{{ 'feature.to.keep.accounts.and.families.secure.and' | tr }}</li>
        </ul>
        <p>
          {{ 'feature.we.don.t.sell.your.information.share' | tr }}
        </p>
      </section>

      <section aria-labelledby="share">
        <h2 id="share">{{ 'feature.who.we.share.it.with' | tr }}</h2>
        <h3>{{ 'feature.your.family' | tr }}</h3>
        <p>
          {{ 'feature.your.co.parent.sees.the.family.calendar' | tr }}
        </p>
        <h3>{{ 'feature.service.providers' | tr }}</h3>
        <ul>
          <li>
            <strong>Microsoft Azure</strong> {{ 'feature.hosts.the.app.its.database.photo.storage' | tr }}
          </li>
          <li>
            <strong>Brevo</strong> {{ 'feature.sends.our.emails.it.receives.the.recipient' | tr }}
          </li>
          <li>
            <strong>Google Places</strong>{{ 'feature.when.address.suggestions.are.switched.on.the' | tr }}
          </li>
          <li>
            <strong>Google Calendar</strong>{{ 'feature.only.if.you.connect.it.in.settings' | tr }}
          </li>
          <li>
            <strong>Google Photos</strong>{{ 'feature.only.if.you.connect.it.and.choose' | tr }}
          </li>
          <li>
            <strong>Google Maps</strong>{{ 'feature.only.when.you.open.a.map.link' | tr }}
          </li>
        </ul>
        <p>
          {{ 'feature.parenthesis.s.use.of.information.received.from' | tr }}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener"
            target="_blank"
            >{{ 'feature.google.api.services.user.data.policy' | tr }}<span class="visually-hidden">
              {{ 'feature.opens.in.a.new.tab' | tr }}</span
            ></a
          >{{ 'feature.including.the.limited.use.requirements' | tr }}
        </p>
        <p>{{ 'feature.we.may.also.share.information.if.the' | tr }}</p>
      </section>

      <section aria-labelledby="storage">
        <h2 id="storage">{{ 'feature.cookies.and.browser.storage' | tr }}</h2>
        <p>
          {{ 'feature.we.use.only.what.s.needed.for' | tr }}
        </p>
        <ul class="items">
          @for (item of storedItems; track item.name) {
            <li>
              <p class="item-name">
                <code>{{ item.name }}</code>
              </p>
              <p class="muted">{{ kinds[item.kind] | tr }}</p>
              <p>{{ item.purpose[language()] }}</p>
              <p class="muted">{{ 'feature.lasts' | tr }} {{ item.lasts[language()] }}</p>
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="keep">
        <h2 id="keep">{{ 'feature.how.long.we.keep.it' | tr }}</h2>
        <ul>
          <li>{{ 'feature.your.account.and.family.information.until.you' | tr }}</li>
          <li>{{ 'feature.event.photos.deleted.28.days.after.upload' | tr }}</li>
          <li>{{ 'feature.co.parent.invitations.they.stop.working.after' | tr }}</li>
          <li>{{ 'feature.change.requests.they.expire.after.14.days' | tr }}</li>
          <li>{{ 'privacy.keep.essentials' | tr }}</li>
          <li>{{ 'feature.technical.logs.about.30.days' | tr }}</li>
          <li>
            {{ 'feature.database.backups.7.days.deleted.information.leaves' | tr }}
          </li>
          <li>{{ 'feature.the.security.record.kept.to.protect.families' | tr }}</li>
        </ul>
        <p>
          {{ 'feature.when.you.delete.your.account.your.sign' | tr }}
        </p>
      </section>

      <section aria-labelledby="choices">
        <h2 id="choices">{{ 'feature.your.choices.and.rights' | tr }}</h2>
        <ul>
          <li>{{ 'feature.see.and.change.your.details.photo.devices' | tr }}</li>
          <li>{{ 'feature.delete.your.account.yourself.in.settings.delete' | tr }}</li>
          <li>{{ 'feature.connect.or.disconnect.google.calendar.in.settings' | tr }}</li>
          <li>
            {{ 'feature.clear.this.site.s.cookies.and.storage' | tr }}
          </li>
          <li>
            {{ 'feature.ask.us.for.a.copy.of.your' | tr }}
            <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a>
            {{ 'feature.from.your.account.s.email.address.we' | tr }}
          </li>
        </ul>
      </section>

      <section aria-labelledby="security">
        <h2 id="security">{{ 'feature.how.we.protect.it' | tr }}</h2>
        <p>
          {{ 'feature.every.connection.is.encrypted.passwords.and.pins' | tr }}
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">{{ 'feature.changes.to.this.notice' | tr }}</h2>
        <p>
          {{ 'feature.we.ll.update.the.date.at.the' | tr }}
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">{{ 'feature.contact' | tr }}</h2>
        <p>
          {{ 'feature.email' | tr }}
          <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a> {{ 'feature.with.any.question.or.request.about.your' | tr }}
        </p>
      </section>
    </article>
  `,
  styles: `
    .notice {
      max-width: 42rem;
    }
    h1 {
      margin-top: 0;
    }
    h2 {
      font-size: var(--font-size-h2);
      margin-top: var(--space-8);
      scroll-margin-top: var(--space-4);
    }
    h3 {
      font-size: var(--font-size-h3);
      margin-top: var(--space-6);
    }
    .contents-heading {
      font-size: var(--font-size-h3);
      margin-top: var(--space-6);
    }
    .contents {
      columns: 2 14rem;
      padding-inline-start: var(--space-4);
    }
    .contents li + li {
      margin-top: 0;
    }
    .contents a {
      display: inline-block;
      min-height: var(--target-min);
      align-content: center;
    }
    ul {
      padding-inline-start: var(--space-6);
    }
    li + li {
      margin-top: var(--space-2);
    }
    .items {
      list-style: none;
      padding: 0;
    }
    .items li {
      padding: var(--space-3) 0;
      border-top: 1px solid var(--color-divider);
    }
    .items p {
      margin: 0 0 var(--space-1);
    }
    code {
      overflow-wrap: anywhere;
    }
    .item-name {
      font-weight: 600;
    }
    .muted {
      color: var(--color-text-secondary);
    }
  `,
})
export class PrivacyPage {
  private readonly locale = inject(LocaleService);
  /** 0 for English, 1 for Spanish: which half of each stored item's text to show. */
  protected readonly language = computed(() => (this.locale.locale() === 'es-419' ? 1 : 0));
  protected readonly storedItems = STORED_ITEMS;
  protected readonly kinds: Record<StoredItem['kind'], TranslationKey> = {
    Cookie: 'privacy.kind.cookie',
    'Browser storage': 'privacy.kind.browser',
    'Tab storage': 'privacy.kind.tab',
  };
  protected readonly sections: readonly { id: string; title: TranslationKey }[] = [
    { id: 'who', title: 'feature.who.we.are' },
    { id: 'collect', title: 'feature.what.we.collect' },
    { id: 'children', title: 'feature.children.s.information' },
    { id: 'health', title: 'privacy.health.title' },
    { id: 'use', title: 'feature.how.we.use.information' },
    { id: 'share', title: 'feature.who.we.share.it.with' },
    { id: 'storage', title: 'feature.cookies.and.browser.storage' },
    { id: 'keep', title: 'feature.how.long.we.keep.it' },
    { id: 'choices', title: 'feature.your.choices.and.rights' },
    { id: 'security', title: 'feature.how.we.protect.it' },
    { id: 'changes', title: 'feature.changes.to.this.notice' },
    { id: 'contact', title: 'feature.contact' },
  ];
}
