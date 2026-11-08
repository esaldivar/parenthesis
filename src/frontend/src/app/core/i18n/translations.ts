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
  'forgot.title': ["Reset your password","Restablecer tu contraseña"],
  'forgot.lead': ["Enter your email and we’ll send you a link to choose a new password.","Ingresa tu correo electrónico y te enviaremos un enlace para elegir una nueva contraseña."],
  'forgot.sent': ["If there’s an account for that email, a reset link is on its way. It works once.","Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña. Solo se puede usar una vez."],
  'forgot.send': ["Send reset link","Enviar enlace para restablecer"],
  'auth.back': ["Back to sign in","Volver a iniciar sesión"],
  'check.title': ["Check your email","Revisa tu correo electrónico"],
  'check.sentPrefix': ["We’ve sent a confirmation link to","Enviamos un enlace de confirmación a"],
  'check.sentSuffix': ["Open it to finish setting up your account.","Ábrelo para terminar de configurar tu cuenta."],
  'check.sentGeneric': ["We’ve sent you a confirmation link. Open it to finish setting up your account.","Te enviamos un enlace de confirmación. Ábrelo para terminar de configurar tu cuenta."],
  'check.resend': ["Send the link again","Volver a enviar el enlace"],
  'check.resendSuccess': ["If that account still needs confirming, a new link is on its way.","Si esa cuenta aún necesita confirmación, recibirás un nuevo enlace."],
  'reset.title': ["Choose a new password","Elige una nueva contraseña"],
  'reset.done': ["Your password has been changed. Other devices have been signed out.","Se cambió tu contraseña. Se cerró la sesión en los demás dispositivos."],
  'reset.invalid': ["This link is invalid or has expired.","Este enlace no es válido o venció."],
  'reset.request': ["Request a new link","Solicitar otro enlace"],
  'reset.newPassword': ["New password","Nueva contraseña"],
  'reset.hint': ["At least 12 characters.","Al menos 12 caracteres."],
  'reset.validation': ["Use at least 12 characters.","Usa al menos 12 caracteres."],
  'reset.save': ["Save new password","Guardar nueva contraseña"],
  'confirm.title': ["Confirm your email","Confirma tu correo electrónico"],
  'confirm.working': ["Confirming…","Confirmando…"],
  'confirm.done': ["Your email is confirmed. You can sign in now.","Tu correo electrónico está confirmado. Ya puedes iniciar sesión."],
  'confirm.invalidHelp': ["Sign in to get a new link, or create your account again.","Inicia sesión para obtener otro enlace o vuelve a crear tu cuenta."],
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
