import { inject, Pipe, PipeTransform } from '@angular/core';
import { LocaleService } from './locale.service';

export const translations = {
  'signIn.title': ['Sign in', 'Iniciar sesión'],
  'signIn.welcome': ['Welcome back.', 'Te damos la bienvenida de nuevo.'],
  'signIn.deleted': ["Your account has been deleted. We've sent a confirmation to your email. You're welcome back any time.", 'Tu cuenta se eliminó. Enviamos una confirmación a tu correo electrónico. Puedes volver cuando quieras.'],
  'signIn.email': ['Email', 'Correo electrónico'],
  'signIn.emailRequired': ['Enter your email address.', 'Ingresa tu correo electrónico.'],
  'signIn.emailInvalid': ['Enter a valid email address.', 'Ingresa un correo electrónico válido.'],
  'signIn.password': ['Password', 'Contraseña'],
  'signIn.passwordRequired': ['Enter your password.', 'Ingresa tu contraseña.'],
  'signIn.loading': ['Signing in…', 'Iniciando sesión…'],
  'signIn.forgot': ['Forgot your password?', '¿Olvidaste tu contraseña?'],
  'signIn.register': ['Create an account', 'Crear una cuenta'],
  'signIn.invalidCredentials': ["We couldn’t sign you in with that email and password. If you’ve just registered, confirm your email first.", 'No pudimos iniciar sesión con ese correo y contraseña. Si acabas de registrarte, primero confirma tu correo electrónico.'],
  'auth.skip': ['Skip to main content', 'Ir al contenido principal'],
  'auth.privacy': ['Privacy', 'Privacidad'],
  'auth.language': ['Language', 'Idioma'],
} as const;

export type TranslationKey = keyof typeof translations;

export function translate(key: TranslationKey, locale: 'en' | 'es-419'): string {
  return translations[key][locale === 'es-419' ? 1 : 0];
}

@Pipe({ name: 'tr', standalone: true, pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly locale = inject(LocaleService);
  transform(key: TranslationKey): string {
    return translate(key, this.locale.locale());
  }
}
