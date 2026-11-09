import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { LocaleService } from './i18n/locale.service';
import { TranslationKey, translate } from './i18n/translations';

const parentRouteTitles = new Map<string, TranslationKey>([
  ['Home', 'nav.home'],
  ['Add to calendar', 'feature.add.to.calendar'],
  ['Edit reminder', 'feature.edit.reminder'],
  ['Edit task', 'feature.edit.task'],
  ['Edit event', 'feature.edit.event'],
  ['Request swap', 'feature.request.swap'],
  ['Calendar', 'nav.calendar'],
  ['Notifications', 'feature.notifications'],
  ['Messages', 'feature.messages'],
  ['Transcripts', 'feature.transcripts'],
  ['From Your Kids', 'feature.from.your.kids'],
  ['Family Memories', 'feature.family.memories'],
  ['Family Memory', 'feature.family.memory'],
  ['Child Essentials', 'feature.child.essentials'],
  ['Approvals', 'feature.approvals'],
  ['Shared records', 'feature.shared.records'],
  ['Settings', 'feature.settings'],
  ['Google Photos', 'route.googlePhotos'],
  ['More', 'nav.more'],
  ['Privacy notice', 'feature.privacy.notice'],
  ['Sign in', 'signIn.title'],
  ['Create your account', 'feature.create.your.account'],
  ['Check your email', 'check.title'],
  ['Confirm your email', 'confirm.title'],
  ['Reset your password', 'forgot.title'],
  ['Choose a new password', 'reset.title'],
  ['Join your co-parent’s family', 'route.joinFamily'],
  ['Is this a shared family device?', 'feature.is.this.a.shared.family.device'],
  ['Who’s using Parenthesis?', 'feature.who.s.using.parenthesis'],
  ['Enter your parent PIN', 'route.parentPin'],
  ['Enter your password', 'route.password'],
  ['Enter your PIN', 'route.pin'],
  ['Choose a new parent PIN', 'feature.choose.a.new.parent.pin'],
  ['Set up a child’s tablet', 'feature.set.up.a.child.s.tablet'],
  ['Set up your family', 'route.setUpFamily'],
]);

/** Every page gets a unique title, including when the language changes without a navigation. */
@Injectable()
export class PageTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly locale = inject(LocaleService);
  private readonly currentPage = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const page = this.currentPage();
      const key = page ? parentRouteTitles.get(page) : undefined;
      const localized = this.locale.locale() === 'es-419' && key ? translate(key, 'es-419') : page;
      this.title.setTitle(localized ? `${localized} · Parenthesis` : 'Parenthesis');
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.currentPage.set(this.buildTitle(snapshot));
  }
}
