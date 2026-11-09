using System.Globalization;
using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;
using NodaTime;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// The shared-device PIN notifications (#153; approved email concepts, built on the existing branded template):
/// parent PIN paused, parent PIN locked, a child's PIN locked, and a child's PIN reset, plus the parent's own reset
/// link. None of them contains a PIN or a sign-in token. A parent's reset link carries a single-use, 15-minute reset
/// token, which grants nothing on its own: the page also needs that parent's own sign-in and password. Names stay out
/// of subjects and previews. Each message goes to one recipient, never CC or BCC.
/// <para>
/// A send that fails is logged without addresses and reported as false, so the app never claims an email was sent
/// when it wasn't. The PIN change itself is already saved either way. SMTP acceptance doesn't prove inbox delivery.
/// </para>
/// </summary>
internal sealed partial class PinSafetyEmails(IEmailSender sender, PublicUrls urls, ILogger<PinSafetyEmails> logger)
{
    /// <summary>Three wrong parent PINs: to that parent only. Returns whether the email was handed to the mail server.</summary>
    public Task<bool> SendParentPausedAsync(
        string to, string parentName, DateTimeOffset retryAt, string timeZone, string resetToken, CancellationToken cancellationToken, bool spanish = false) =>
        TrySendAsync(to, new EmailContent(
            spanish ? "Tu PIN de adulto está en pausa" : "Your parent PIN is paused",
            spanish ? "Puedes volver a intentar después de la pausa o restablecer tu PIN" : "You can retry after the pause or reset your PIN",
            parentName,
            [
                spanish ? "Alguien ingresó un PIN incorrecto para tu perfil tres veces en un dispositivo familiar compartido. Tu PIN de adulto está en pausa durante 10 minutos." : "Someone entered the wrong parent PIN for your profile three times on a shared family device, so we've paused your parent PIN for 10 minutes.",
                spanish ? $"Puedes volver a intentar después de las {FormatTime(retryAt, timeZone, spanish)}." : $"You can try again after {FormatTime(retryAt, timeZone)}.",
                spanish ? "Si olvidaste tu PIN, usa el botón de abajo. El enlace es de un solo uso y vence en 15 minutos. Inicia sesión con tu correo y contraseña antes de elegir un nuevo PIN. Tu cuenta y tu contraseña siguen funcionando." : "If you've forgotten your PIN, use the button below. The link works once, for 15 minutes, and you'll sign in with your email and password before choosing a new PIN. Your account and password aren't affected.",
            ],
            new EmailAction(spanish ? "Restablecer PIN" : "Reset PIN", ResetLink(resetToken)),
            spanish ? "Recibes este aviso porque tu PIN de adulto está en pausa. Nunca enviamos PIN por correo electrónico." : "You're getting this because your parent PIN was paused. We never send PINs by email.", spanish), cancellationToken);

    /// <summary>Three more wrong parent PINs after a pause: to that parent only.</summary>
    public Task<bool> SendParentLockedAsync(string to, string parentName, string resetToken, CancellationToken cancellationToken, bool spanish = false) =>
        TrySendAsync(to, new EmailContent(
            spanish ? "Tu PIN de adulto está bloqueado" : "Your parent PIN is locked",
            spanish ? "Restablece tu PIN para usar tu perfil" : "Reset your PIN to use your parent profile",
            parentName,
            [
                spanish ? "Se ingresó tu PIN de adulto incorrectamente tres veces más después de una pausa. Está bloqueado hasta que elijas uno nuevo." : "Your parent PIN was entered incorrectly three more times after a pause, so it's locked until you choose a new one.",
                spanish ? "Tu cuenta y tu contraseña siguen funcionando. Usa el botón de abajo para elegir otro PIN. El enlace es de un solo uso y vence en 15 minutos. Primero inicia sesión con tu correo y contraseña. Los demás perfiles del dispositivo siguen funcionando." : "Your account and password aren't locked. Use the button below to choose a new PIN: the link works once, for 15 minutes, and you'll sign in with your email and password first. Other profiles on the device still work.",
                spanish ? "Si también olvidaste tu contraseña, selecciona «¿Olvidaste tu contraseña?» en la pantalla de inicio de sesión. También puedes elegir un nuevo PIN en Configuración." : "If you've also forgotten your password, use \"Forgot your password?\" on the sign-in page first. You can always choose a new PIN in Settings too.",
            ],
            new EmailAction(spanish ? "Restablecer PIN" : "Reset PIN", ResetLink(resetToken)),
            spanish ? "Si no intentaste usar tu PIN de adulto, es posible que otra persona lo haya hecho. Puedes quitar un dispositivo perdido en Configuración. Nunca enviamos PIN por correo electrónico." : "If you didn't try to use your parent PIN, someone else may have. You can remove a lost device in Settings. We never send PINs by email.", spanish),
            cancellationToken);

    /// <summary>A reset link the parent asked for from their PIN screen ("Forgot your PIN?"): to that parent only.</summary>
    public Task<bool> SendParentResetLinkAsync(string to, string parentName, string resetToken, CancellationToken cancellationToken, bool spanish = false) =>
        TrySendAsync(to, new EmailContent(
            spanish ? "Restablece tu PIN de adulto" : "Reset your parent PIN",
            spanish ? "Elige un nuevo PIN de adulto" : "Choose a new parent PIN",
            parentName,
            [
                spanish ? "Alguien solicitó restablecer el PIN de tu perfil de adulto en un dispositivo familiar compartido." : "Someone asked to reset the parent PIN for your profile on a shared family device.",
                spanish ? "El enlace es de un solo uso y vence en 15 minutos. Inicia sesión con tu correo y contraseña antes de elegir un nuevo PIN." : "The link works once, for 15 minutes. You'll sign in with your email and password before choosing a new PIN.",
            ],
            new EmailAction(spanish ? "Restablecer PIN" : "Reset PIN", ResetLink(resetToken)),
            spanish ? "Si no lo solicitaste, puedes ignorar este correo. Tu PIN no cambiará. Nunca enviamos PIN por correo electrónico." : "If you didn't ask for this, you can ignore this email. Your PIN won't change. We never send PINs by email.", spanish),
            cancellationToken);

    /// <summary>A child's PIN needs a reset: to each currently authorized parent, separately. Returns how many were sent.</summary>
    public async Task<int> SendChildLockedAsync(
        IReadOnlyCollection<(string Email, string Name, bool Spanish)> parents, string childName, CancellationToken cancellationToken)
    {
        var sent = 0;
        foreach (var (email, name, spanish) in parents)
        {
            var ok = await TrySendAsync(email, new EmailContent(
                spanish ? "Se bloqueó el PIN de un hijo" : "A child's PIN is locked",
                spanish ? "Inicia sesión para ayudar a restablecer el PIN" : "Sign in to help reset the PIN",
                name,
                [
                    spanish ? $"Se ingresó demasiadas veces un PIN incorrecto para {childName}. Permanecerá bloqueado hasta que un padre o madre elija uno nuevo." : $"{childName}'s PIN was entered incorrectly too many times, so it's locked until a parent chooses a new one.",
                    spanish ? "Cualquiera de los padres puede restablecerlo. Inicia sesión con tu correo y contraseña y abre Configuración. Los demás perfiles del dispositivo siguen funcionando." : "Either parent can reset it: sign in with your own email and password, then go to Settings. Other profiles on the device still work.",
                ],
                new EmailAction(spanish ? "Iniciar sesión" : "Sign in", SettingsLink()),
                spanish ? "Recibes este correo porque eres padre o madre de esta familia en Parenthesis. Nunca enviamos PIN por correo electrónico." : "You're getting this because you're a parent in this family on Parenthesis. We never send PINs by email.", spanish),
                cancellationToken);
            sent += ok ? 1 : 0;
        }

        return sent;
    }

    /// <summary>After a parent resets a child's PIN: to the other currently authorized parent(s) only, without the PIN.</summary>
    public async Task SendChildPinResetAsync(
        IReadOnlyCollection<(string Email, string Name, bool Spanish)> otherParents, string actorName, string childName, CancellationToken cancellationToken)
    {
        foreach (var (email, name, spanish) in otherParents)
        {
            await TrySendAsync(email, new EmailContent(
                spanish ? "Se restableció el PIN de un hijo" : "A child's PIN was reset",
                spanish ? "Un padre o madre actualizó el PIN de un hijo" : "A parent updated a child's PIN",
                name,
                [
                    spanish ? $"{actorName} configuró un nuevo PIN para {childName}. Se eliminó cualquier pausa o bloqueo de su PIN." : $"{actorName} set a new PIN for {childName}. Any pause or lock on {childName}'s PIN has been cleared.",
                    spanish ? "Por privacidad, este correo no incluye el PIN nuevo." : "For privacy, the new PIN isn't included in this email.",
                ],
                new EmailAction(spanish ? "Ver cuenta" : "View account", SettingsLink()),
                spanish ? "Recibes este correo porque eres padre o madre de esta familia en Parenthesis." : "You're getting this because you're a parent in this family on Parenthesis.", spanish), cancellationToken);
        }
    }

    /// <summary>"4:35 PM on November 2, 2026 (America/Chicago)": an absolute time in the family's time zone.</summary>
    internal static string FormatTime(DateTimeOffset at, string timeZone, bool spanish = false)
    {
        var zone = DateTimeZoneProviders.Tzdb.GetZoneOrNull(timeZone) ?? DateTimeZone.Utc;
        var local = Instant.FromDateTimeOffset(at).InZone(zone);
        var formatted = spanish
            ? local.ToString("H:mm 'del' d 'de' MMMM 'de' yyyy", CultureInfo.GetCultureInfo("es-419"))
            : local.ToString("h:mm tt 'on' MMMM d, yyyy", CultureInfo.InvariantCulture);
        return formatted + $" ({zone.Id})";
    }

    private Uri SettingsLink() => urls.Build("/settings", new Dictionary<string, string?>());

    private Uri ResetLink(string token) => urls.Build("/parent-pin/reset", new Dictionary<string, string?> { ["token"] = token });

    private async Task<bool> TrySendAsync(string to, EmailContent content, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(EmailTemplate.Render(to, content), cancellationToken);
            return true;
        }
#pragma warning disable CA1031 // Delivery failures are logged; the PIN change is already saved and shown in the app.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, content.Subject);
            return false;
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send PIN notification '{Subject}'")]
    private partial void LogSendFailed(Exception exception, string subject);
}
