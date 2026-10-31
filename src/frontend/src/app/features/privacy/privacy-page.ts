import { ChangeDetectionStrategy, Component } from '@angular/core';

/** One cookie or browser storage item, as listed in docs/privacy/data-inventory.md. */
interface StoredItem {
  readonly name: string;
  readonly kind: 'Cookie' | 'Browser storage' | 'Tab storage';
  readonly purpose: string;
  readonly lasts: string;
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
    purpose: 'Keeps you signed in.',
    lasts: '14 days after your last visit, or until you sign out.',
  },
  {
    name: '__Host-parenthesis-af',
    kind: 'Cookie',
    purpose: 'Protects your account from forged requests from other sites.',
    lasts: 'Until you close the browser.',
  },
  {
    name: 'XSRF-TOKEN',
    kind: 'Cookie',
    purpose: 'Works with the cookie above to protect your account from forged requests.',
    lasts: 'Until you close the browser.',
  },
  {
    name: '__Host-parenthesis-device',
    kind: 'Cookie',
    purpose: 'Recognizes a shared family device or a child’s tablet that a parent registered.',
    lasts:
      '30 days for a shared device, about 400 days for a child’s tablet, or until a parent removes it.',
  },
  {
    name: 'parenthesis.appearance.…',
    kind: 'Browser storage',
    purpose: 'Your light, dark or system appearance choice.',
    lasts: 'Until you clear it.',
  },
  {
    name: 'parenthesis.event-themes.…',
    kind: 'Browser storage',
    purpose: 'Whether you want themes on events.',
    lasts: 'Until you clear it.',
  },
  {
    name: 'parenthesis.calendar-filters.…',
    kind: 'Browser storage',
    purpose: 'The calendar filters you chose.',
    lasts: 'Until you reset the filters or clear it.',
  },
  {
    name: 'parenthesis.sharedDevice.declined:…',
    kind: 'Browser storage',
    purpose:
      'Remembers that you said this isn’t a shared family device, so we don’t ask at every sign-in.',
    lasts: 'Until you clear it or set the device up as shared.',
  },
  {
    name: 'parenthesis.pendingInvitation',
    kind: 'Browser storage',
    purpose: 'Keeps a co-parent invitation while you create your account.',
    lasts: 'Until it’s used, or 7 days at most.',
  },
  {
    name: 'parenthesis.parentPinReset',
    kind: 'Tab storage',
    purpose: 'Keeps a parent PIN reset link while you choose a new PIN.',
    lasts: 'Until it’s used or you close the tab.',
  },
];

/**
 * The public Privacy Notice (#416). It must describe what the app does today: check docs/privacy/data-inventory.md and
 * update both together when collection, sharing, storage or retention changes.
 */
@Component({
  selector: 'app-privacy-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="notice">
      <h1>Privacy notice</h1>
      <p class="muted">Last updated October 31, 2026</p>

      <p>
        Parenthesis helps separated parents share a family calendar, make decisions together and
        keep family memories. This notice explains what information we collect, why, who we share it
        with, how long we keep it, and the choices you have. We wrote it in plain language. If
        anything is unclear, write to us.
      </p>

      <nav aria-labelledby="contents-heading">
        <h2 id="contents-heading" class="contents-heading">On this page</h2>
        <ul class="contents">
          @for (section of sections; track section.id) {
            <li>
              <a [href]="'/privacy#' + section.id">{{ section.title }}</a>
            </li>
          }
        </ul>
      </nav>

      <section aria-labelledby="who">
        <h2 id="who">Who we are</h2>
        <p>
          Parenthesis is run by Eric Saldivar, an individual in the United States. Parenthesis is
          for families in the United States. For anything about your privacy, email
          <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a>.
        </p>
      </section>

      <section aria-labelledby="collect">
        <h2 id="collect">What we collect</h2>
        <h3>About parents</h3>
        <ul>
          <li>
            Your name, email address and password. We store your password and any parent PIN only as
            a secure hash, never as text.
          </li>
          <li>A profile photo, if you add one.</li>
          <li>
            Your family: its name and time zone, who is in it, and invitations you send to your
            co-parent.
          </li>
          <li>
            What you add to the family calendar: events, tasks, reminders, times you’re unavailable,
            locations you type, and change requests between parents with their decisions.
          </li>
          <li>
            Event photos you upload. We remove location and other hidden details from photos when
            you upload them.
          </li>
          <li>
            The names of devices you register, such as a shared family tablet, and when they were
            set up.
          </li>
        </ul>
        <h3>About how the service is used</h3>
        <ul>
          <li>
            A security record of important actions (for example, who approved a change and when). It
            holds account ids and times, not what was written.
          </li>
          <li>Technical logs from our hosting, used to find and fix errors.</li>
          <li>
            Your IP address, used for a few minutes to slow down repeated sign-in attempts. We don’t
            store it with your account.
          </li>
        </ul>
        <p>
          We don’t use analytics, advertising or tracking tools, and we don’t load other companies’
          scripts in your browser.
        </p>
      </section>

      <section aria-labelledby="children">
        <h2 id="children">Children’s information</h2>
        <p>
          Children, including children under 13, use Parenthesis only through a profile that a
          parent creates. When there are two parents, the other parent approves the profile first.
          Children don’t have an email address or password with us.
        </p>
        <ul>
          <li>
            We keep a child’s first name, their PIN (as a secure hash only), an optional profile
            photo, and their own settings, such as how things look.
          </li>
          <li>
            We collect children’s information from their parents, or from the child using the
            profile their parents set up. We ask only for what each feature needs.
          </li>
          <li>
            Children never see ads, and their information is never sold or used for marketing.
          </li>
          <li>
            A parent can see and change their child’s profile and photo in Settings, and can turn
            off the child’s access or remove a child’s tablet at any time. To have a child’s
            information deleted, email us from the parent’s account address.
          </li>
        </ul>
      </section>

      <section aria-labelledby="use">
        <h2 id="use">How we use information</h2>
        <ul>
          <li>
            To run Parenthesis: show your family calendar, send requests to your co-parent, and keep
            your photos and settings.
          </li>
          <li>
            To send account emails, such as confirming your email, resetting a password, invitations
            and notices about your family.
          </li>
          <li>To keep accounts and families secure and to fix problems.</li>
        </ul>
        <p>
          We don’t sell your information, share it for advertising, or use it to build profiles
          about you.
        </p>
      </section>

      <section aria-labelledby="share">
        <h2 id="share">Who we share it with</h2>
        <h3>Your family</h3>
        <p>
          Your co-parent sees the family calendar, shared items and decisions. Children see only
          what’s meant for them, never requests or decisions between parents.
        </p>
        <h3>Service providers</h3>
        <ul>
          <li>
            <strong>Microsoft Azure</strong> hosts the app, its database, photo storage and logs, in
            the United States.
          </li>
          <li>
            <strong>Brevo</strong> sends our emails. It receives the recipient’s email address and
            the email itself: parents’ names, the family name, a child’s first name in PIN safety
            notices, and a link. Emails never include calendar or approval details.
          </li>
          <li>
            <strong>Google Places</strong>, when address suggestions are switched on: the text you
            type in an event’s location field is sent from our server to Google to suggest
            addresses. Your browser doesn’t contact Google.
          </li>
          <li>
            <strong>Google Calendar</strong>, only if you connect it in Settings. We copy the
            confirmed family events you choose into a separate calendar Parenthesis creates in your
            Google account. We never read your other Google calendars. Disconnecting removes that
            calendar and our access.
          </li>
          <li>
            <strong>Google Maps</strong>, only when you open a map link on an event. That opens
            Google Maps with the event’s address.
          </li>
        </ul>
        <p>
          Parenthesis’s use of information received from Google APIs follows the
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener"
            target="_blank"
            >Google API Services User Data Policy<span class="visually-hidden">
              (opens in a new tab)</span
            ></a
          >, including the Limited Use requirements.
        </p>
        <p>We may also share information if the law requires it, or to protect someone’s safety.</p>
      </section>

      <section aria-labelledby="storage">
        <h2 id="storage">Cookies and browser storage</h2>
        <p>
          We use only what’s needed for Parenthesis to work, plus a few choices you make yourself.
          Because there is nothing optional, there’s no cookie banner. None of these are shared with
          other companies.
        </p>
        <ul class="items">
          @for (item of storedItems; track item.name) {
            <li>
              <p class="item-name">
                <code>{{ item.name }}</code>
              </p>
              <p class="muted">{{ item.kind }}</p>
              <p>{{ item.purpose }}</p>
              <p class="muted">Lasts: {{ item.lasts }}</p>
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="keep">
        <h2 id="keep">How long we keep it</h2>
        <ul>
          <li>Your account and family information: until you delete your account.</li>
          <li>Event photos: deleted 28 days after upload, or sooner if you delete them.</li>
          <li>Co-parent invitations: they stop working after 7 days.</li>
          <li>Change requests: they expire after 14 days if nobody decides.</li>
          <li>Technical logs: about 30 days.</li>
          <li>
            Database backups: 7 days. Deleted information leaves the backups within that time.
          </li>
          <li>The security record: kept to protect families. It holds only ids and times.</li>
        </ul>
        <p>
          When you delete your account, your sign-in, name and email are removed at once. If your
          co-parent stays, the family, its children and its shared history stay with them, and you
          show as “Former parent”. If you’re the only parent, the family and its children are
          deleted too.
        </p>
      </section>

      <section aria-labelledby="choices">
        <h2 id="choices">Your choices and rights</h2>
        <ul>
          <li>See and change your details, photo, devices and children’s profiles in Settings.</li>
          <li>Delete your account yourself in Settings → Delete account.</li>
          <li>Connect or disconnect Google Calendar in Settings at any time.</li>
          <li>
            Clear this site’s cookies and storage in your browser at any time. You’ll be signed out,
            and choices such as appearance go back to their defaults.
          </li>
          <li>
            Ask us for a copy of your information, to correct it, or to delete it, by emailing
            <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a>
            from your account’s email address. We’ll reply within 30 days.
          </li>
        </ul>
      </section>

      <section aria-labelledby="security">
        <h2 id="security">How we protect it</h2>
        <p>
          Every connection is encrypted. Passwords and PINs are stored as secure hashes. Sign-in
          cookies can’t be read by scripts or sent by other sites. Photos are kept in private
          storage and checked against your family on every view. Each family’s information is kept
          apart from every other family’s.
        </p>
      </section>

      <section aria-labelledby="changes">
        <h2 id="changes">Changes to this notice</h2>
        <p>
          We’ll update the date at the top when this notice changes. If a change affects how we use
          your information, we’ll tell parents before it takes effect.
        </p>
      </section>

      <section aria-labelledby="contact">
        <h2 id="contact">Contact</h2>
        <p>
          Email
          <a href="mailto:privacy@parenthesisfamily.com">privacy&#64;parenthesisfamily.com</a> with
          any question or request about your privacy or your child’s.
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
  protected readonly storedItems = STORED_ITEMS;
  protected readonly sections = [
    { id: 'who', title: 'Who we are' },
    { id: 'collect', title: 'What we collect' },
    { id: 'children', title: 'Children’s information' },
    { id: 'use', title: 'How we use information' },
    { id: 'share', title: 'Who we share it with' },
    { id: 'storage', title: 'Cookies and browser storage' },
    { id: 'keep', title: 'How long we keep it' },
    { id: 'choices', title: 'Your choices and rights' },
    { id: 'security', title: 'How we protect it' },
    { id: 'changes', title: 'Changes to this notice' },
    { id: 'contact', title: 'Contact' },
  ] as const;
}
