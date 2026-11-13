import { HttpErrorResponse } from '@angular/common/http';

import { AppLocale } from '../i18n/locale.service';

const responseLocales = new WeakMap<HttpErrorResponse, AppLocale>();

export function rememberProblemLocale(error: unknown, locale: AppLocale): void {
  if (error instanceof HttpErrorResponse) responseLocales.set(error, locale);
}

const spanishErrors = new Map([
  ['Invalid email or password.', 'El correo electrónico o la contraseña no son correctos.'],
  ['Enter a valid email address.', 'Ingresa un correo electrónico válido.'],
  ['Enter a password.', 'Ingresa una contraseña.'],
  ['This link is invalid or has expired.', 'Este enlace no es válido o venció.'],
  ['Choose English or Spanish.', 'Elige inglés o español.'],
  ['Could not save your language preference.', 'No se pudo guardar tu idioma.'],
  ['One or more validation errors occurred.', 'Revisa los campos indicados.'],
  ["Another photo change was saved at the same time.", "Se guardó otro cambio en la foto al mismo tiempo."],
  ["Google Calendar isn't available yet.", "Google Calendar aún no está disponible."],
  ["Google Photos isn't available yet.", "Google Fotos aún no está disponible."],
  ["Google didn't answer.", "Google no respondió."],
  ["Sign-up here is by invitation only.", "Solo puedes registrarte con una invitación."],
  ["Someone else just answered this request.", "Otra persona acaba de responder esta solicitud."],
  ["That PIN didn't work.", "Ese PIN no funcionó."],
  ["That code didn't work.", "Ese código no funcionó."],
  ["The other parent just changed this task.", "El otro padre o madre acaba de cambiar esta tarea."],
  ["This can't be approved as it is now.", "Esto no se puede aprobar en su estado actual."],
  ["This event already has a request waiting for an answer.", "Este evento ya tiene una solicitud pendiente de respuesta."],
  ["This family already has two parents.", "Esta familia ya tiene dos padres."],
  ["This invitation is no longer available.", "Esta invitación ya no está disponible."],
  ["This invitation isn't valid any more.", "Esta invitación ya no es válida."],
  ["This invitation was sent to a different email address.", "Esta invitación se envió a otro correo electrónico."],
  ["This profile can't reset a PIN on this device.", "Este perfil no puede restablecer un PIN en este dispositivo."],
  ["This profile can't sign in on this device.", "Este perfil no puede iniciar sesión en este dispositivo."],
  ["This request has already been decided.", "Ya se tomó una decisión sobre esta solicitud."],
  ["This reset link has expired or was already used.", "Este enlace venció o ya se usó."],
  ["This task has a checklist.", "Esta tarea tiene una lista de verificación."],
  ["Use the parent account this reset link was sent to.", "Usa la cuenta a la que se envió este enlace."],
  ["We couldn't check that PIN.", "No pudimos verificar ese PIN."],
  ["We sent a reset link recently.", "Hace poco enviamos un enlace para restablecer el PIN."],
  ["You already have a family on Parenthesis.", "Ya tienes una familia en Parenthesis."],
  ["You don't have a parent PIN yet.", "Aún no tienes un PIN de adulto."],
  ["You're already a member of this family.", "Ya formas parte de esta familia."],
  ["You've already given your answer on this request.", "Ya respondiste esta solicitud."],
  ["Your parent PIN is locked.", "Tu PIN de adulto está bloqueado."],
  ["Your parent PIN is paused.", "Tu PIN de adulto está en pausa."],
  ["Change repeating parenting time one date at a time for now. Each change goes to your co-parent.", "Por ahora, cambia una fecha a la vez del tiempo con tus hijos que se repite. Cada cambio se envía al otro padre o madre."],
  ["Choose 4 to 6 digits that aren't all the same or in a simple run like 1234.", "Elige de 4 a 6 dígitos. Evita repetir un solo dígito o usar secuencias como 1234."],
  ["Choose a Child Essentials section.", "Elige una sección de información de tus hijos."],
  ["Choose a child who's in this family (and approved by both parents).", "Elige un hijo de esta familia cuyo perfil hayan aprobado ambos padres."],
  ["Choose a provider type.", "Elige un tipo de profesional de salud."],
  ["Choose a valid time zone, such as America/Chicago.", "Elige una zona horaria válida, como America/Chicago."],
  ["Choose an end date from the first day to a year later.", "Elige una fecha de finalización entre el primer día y un año después."],
  ["Choose an end that's after the start.", "Elige una hora de finalización posterior al inicio."],
  ["Choose children who are in this family (and approved by both parents).", "Elige hijos de esta familia cuyos perfiles hayan aprobado ambos padres."],
  ["Choose different dates or times for the swap.", "Elige otras fechas u horas para el intercambio."],
  ["Choose how often it repeats.", "Elige con qué frecuencia se repite."],
  ["Choose the day it's due.", "Elige la fecha de vencimiento."],
  ["Choose the days it repeats on.", "Elige los días en que se repite."],
  ["Choose this event, this and following, or all events.", "Elige este evento, este y los siguientes, o todos los eventos."],
  ["Choose what kind of event this is.", "Elige el tipo de evento."],
  ["Choose when a repeating reminder ends: an end date or a number of times.", "Elige cuándo termina la repetición del recordatorio: en una fecha o después de cierto número de veces."],
  ["Choose when it ends: on a date or after a number of times.", "Elige cuándo termina: en una fecha o después de cierto número de veces."],
  ["Choose when the reminder is for.", "Elige cuándo debe aparecer el recordatorio."],
  ["Choose which children this parenting time is for.", "Elige qué hijos participan en este tiempo de convivencia."],
  ["Choose which kinds of event to copy.", "Elige qué tipos de eventos quieres copiar."],
  ["Choose which parent has the children.", "Elige con qué padre o madre estarán los hijos."],
  ["Each date would run into the next. Repeat it less often, or make it shorter.", "Los eventos se superponen. Reduce la frecuencia o la duración."],
  ["Each message needs its own id.", "Cada mensaje necesita un identificador único."],
  ["Each provider must have a unique identifier.", "Cada profesional debe tener un identificador único."],
  ["Enter a caregiver name.", "Ingresa el nombre del cuidador."],
  ["Enter a name, relationship, and phone number for each contact.", "Ingresa el nombre, la relación y el teléfono de cada contacto."],
  ["Enter a phone number with 7 to 15 digits.", "Ingresa un número de teléfono de 7 a 15 dígitos."],
  ["Enter a phone number.", "Ingresa un número de teléfono."],
  ["Enter a practice address.", "Ingresa la dirección del consultorio."],
  ["Enter a provider name.", "Ingresa el nombre del profesional de salud."],
  ["Enter an hourly rate from 0 to 10,000 with up to two decimal places.", "Ingresa una tarifa por hora entre 0 y 10,000, con hasta dos decimales."],
  ["Enter something to search for.", "Ingresa algo para buscar."],
  ["Enter your co-parent's email address, not your own.", "Ingresa el correo electrónico del otro padre o madre."],
  ["Google didn't give Parenthesis access to add photos. Try again and allow Google Photos access.", "Google no dio permiso a Parenthesis para agregar fotos. Inténtalo de nuevo y permite el acceso a Google Fotos."],
  ["Google didn't give Parenthesis access to make its calendar. Try again and allow calendar access.", "Google no dio permiso a Parenthesis para crear el calendario. Inténtalo de nuevo y permite el acceso a Google Calendar."],
  ["Holidays and family events can't repeat yet. Add each date on its own.", "Los días festivos y los eventos familiares aún no se pueden repetir. Agrega cada fecha por separado."],
  ["Homeroom teacher is available for pre-K through fifth grade.", "Puedes indicar el docente a cargo desde preescolar hasta quinto grado."],
  ["Name the rows that were seen.", "Indica qué elementos se vieron."],
  ["No messages in this date range.", "No hay mensajes en este intervalo de fechas."],
  ["None of the chosen days fall before the end date.", "Ninguno de los días elegidos cae antes de la fecha de finalización."],
  ["Say which message was read.", "Indica qué mensaje se leyó."],
  ["Select a supported school grade.", "Selecciona un grado escolar disponible."],
  ["Select one Call first contact per child.", "Selecciona un contacto al que llamar primero para cada hijo."],
  ["Send the version of the task you edited.", "Envía la versión de la tarea que editaste."],
  ["That event isn’t on your calendar any more. Choose another one.", "Ese evento ya no está en tu calendario. Elige otro."],
  ["That many times goes past a year. Choose fewer, or an end date.", "Esa cantidad de repeticiones supera un año. Elige menos repeticiones o una fecha de finalización."],
  ["That password isn't right.", "La contraseña no es correcta."],
  ["That phone number is already on this child’s emergency contact list.", "Ese número de teléfono ya está en la lista de contactos de emergencia de este hijo."],
  ["The checklist changed. Refresh and try again.", "La lista de verificación cambió. Actualiza la página y vuelve a intentarlo."],
  ["The end date can’t be before the start date.", "La fecha de finalización no puede ser anterior a la de inicio."],
  ["This Google sign-in link has expired or isn't yours. Start again from Settings.", "Este enlace de Google venció o no pertenece a tu cuenta. Vuelve a iniciar el proceso desde Configuración."],
  ["This Google sign-in link has expired or was already used. Start again from Settings.", "Este enlace de Google venció o ya se usó. Vuelve a iniciar el proceso desde Configuración."],
  ["This list can hold up to 30 caregivers.", "Esta lista puede incluir hasta 30 cuidadores."],
  ["Unavailable time is about you, so it doesn't include children.", "El horario no disponible se refiere a ti y no incluye a tus hijos."],
  ["Write a message first.", "Primero escribe un mensaje."],
  ["Both parents need to be in the family to keep a Child Support record.", "Ambos padres deben pertenecer a la familia para llevar un registro de manutención infantil."],
  ["Contributions can be reported once both parents agree to the fund.", "Puedes registrar aportes cuando ambos padres acepten el fondo."],
  ["Only the paying parent reports payments on this record.", "Solo el padre o madre que paga puede registrar pagos aquí."],
  ["Enter an amount above zero and the date the money moved.", "Ingresa un monto mayor que cero y la fecha en que se hizo el pago."],
  ["Your co-parent has left the family, so this record can't take new reports.", "El otro padre o madre salió de la familia. Ya no puedes agregar pagos a este registro."],
  ["Attachments can't be saved yet. Try again later.", "Por ahora no se pueden guardar los archivos adjuntos. Inténtalo más tarde."],
  ["Attach a file of 10 MB or less.", "Adjunta un archivo de 10 MB o menos."],
  ["Attach a PDF, PNG or JPEG file.", "Adjunta un archivo PDF, PNG o JPEG."],
  ["The attachment couldn't be saved. Try again.", "No se pudo guardar el archivo adjunto. Inténtalo de nuevo."],
  ["Only the other parent can respond to this report.", "Solo el otro padre o madre puede responder a este registro."],
  ["This report has already been answered.", "Ya se respondió a este registro."],
  // Client-side calendar validation (#534); the same sentences the server sends where they overlap.
  ["Enter a title.", "Ingresa un título."],
  ["Choose a start date.", "Elige una fecha de inicio."],
  ["Choose an end date.", "Elige una fecha de finalización."],
  ["Choose a start date from today on.", "Elige una fecha de inicio a partir de hoy."],
  ["Choose an end date from today on.", "Elige una fecha de finalización a partir de hoy."],
  ["Choose a date from today on.", "Elige una fecha a partir de hoy."],
  ["Enter a date like 10/27/2026.", "Ingresa una fecha como 10/27/2026 (mes/día/año)."],
  ["Choose an end within 31 days of the start.", "Elige una finalización dentro de los 31 días posteriores al inicio."],
]);

/** A message in the parent's language when the catalog has it, otherwise as it is (#534). */
export function localizeMessage(message: string, locale: AppLocale): string {
  return locale === 'es-419'
    ? (spanishErrors.get(message) ?? spanishErrors.get(message.replaceAll('’', "'")) ?? message)
    : message;
}

/** An RFC 9457 problem response from the API, reduced to what the UI needs. */
export interface Problem {
  readonly status: number;
  readonly locale?: AppLocale;
  readonly title?: string;
  /** The API's second line, for example "2 tries left." or "Ask Mom or Dad to unlock it." */
  readonly detail?: string;
  /** The problem type URI, when the API sets one (for example `…/existing-family`). */
  readonly type?: string;
  /** Field errors from a validation problem, keyed by the request's field names. */
  readonly errors: Readonly<Record<string, readonly string[]>>;
  /** A wrong PIN: how many tries are left before it pauses or locks. */
  readonly triesLeft?: number;
  /** A PIN that can't be tried right now (#153): paused for a while, locked until reset, or not set up. */
  readonly state?: 'paused' | 'locked' | 'no-pin';
  /** When a paused PIN can be tried again (ISO time). The server decides; the page only shows it. */
  readonly retryAt?: string;
  /** Present when this request tried to email someone: true only if the mail server accepted it. */
  readonly notified?: boolean;
  /** A short code for why the server refused, when it gives one (for example event photos' "storage-full"). */
  readonly reason?: string;
}

export function toProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return { status: 0, errors: {} };
  }
  const body = typeof error.error === 'object' && error.error !== null ? error.error : {};
  const spanish = responseLocales.get(error) === 'es-419';
  const localized = (message: string) => spanish ? (spanishErrors.get(message) ?? spanishErrors.get(message.replaceAll("’", "'")) ?? message) : message;
  const errors = typeof body.errors === 'object' && body.errors !== null ? body.errors as Record<string, unknown> : {};
  return {
    status: error.status,
    ...(spanish ? { locale: 'es-419' as const } : {}),
    title: typeof body.title === 'string' ? localized(body.title) : undefined,
    detail: typeof body.detail === 'string' ? localized(body.detail) : undefined,
    type: typeof body.type === 'string' ? body.type : undefined,
    errors: Object.fromEntries(Object.entries(errors).map(([field, messages]) => [
      field,
      Array.isArray(messages) ? messages.filter((message): message is string => typeof message === 'string').map(localized) : [],
    ])),
    triesLeft: typeof body.triesLeft === 'number' ? body.triesLeft : undefined,
    state: body.state === 'paused' || body.state === 'locked' || body.state === 'no-pin' ? body.state : undefined,
    retryAt: typeof body.retryAt === 'string' ? body.retryAt : undefined,
    notified: typeof body.notified === 'boolean' ? body.notified : undefined,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  };
}

/** A friendly sentence for failures that aren't about a particular field. */
export function generalMessage(problem: Problem): string {
  if (problem.locale === 'es-419') {
    if (problem.status === 0) return 'No pudimos conectarnos con Parenthesis. Revisa tu conexión e inténtalo de nuevo.';
    if (problem.status === 429) return 'Hubo demasiados intentos. Espera un minuto y vuelve a intentarlo.';
    if (problem.status >= 500) return 'Algo salió mal de nuestro lado. Inténtalo de nuevo.';
    return problem.title ?? 'No funcionó. Inténtalo de nuevo.';
  }
  switch (problem.status) {
    case 0:
      return 'We couldn’t reach Parenthesis. Check your connection and try again.';
    case 429:
      return 'Too many attempts. Please wait a minute and try again.';
    default:
      return problem.status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : (problem.title ?? 'That didn’t work. Please try again.');
  }
}
