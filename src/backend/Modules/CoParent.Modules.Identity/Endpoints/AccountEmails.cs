using System.Text;
using CoParent.Infrastructure.Email;
using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Identity.Endpoints;

/// <summary>
/// Account emails. A failed send is logged and swallowed: the account change already happened, and the user can
/// ask for the email again. (A transactional outbox replaces this in F-09.) Logs never include email addresses.
/// </summary>
internal sealed partial class AccountEmails(
    UserManager<AppUser> users, IEmailSender sender, PublicUrls urls, ILogger<AccountEmails> logger)
{
    public async Task SendConfirmationAsync(AppUser user, CancellationToken cancellationToken)
    {
        var token = Encode(await users.GenerateEmailConfirmationTokenAsync(user));
        var link = urls.Build("/confirm-email", new Dictionary<string, string?>
        {
            ["userId"] = user.Id.ToString(),
            ["token"] = token,
        });

        var spanish = await IsSpanishAsync(user);
        await TrySendAsync(Compose(
            user,
            spanish ? "Confirma tu correo electrónico de Parenthesis" : "Confirm your email for Parenthesis",
            spanish ? "Solo falta un paso: confirma tu correo electrónico" : "One step left: confirm your email",
            [spanish ? "Confirma tu correo electrónico para terminar de configurar tu cuenta. El enlace solo se puede usar una vez." : "Confirm your email address to finish setting up your Parenthesis account. The link works once."],
            new EmailAction(spanish ? "Confirmar correo electrónico" : "Confirm email", link),
            spanish ? "Si no creaste una cuenta, puedes ignorar este mensaje." : "If you didn't create an account, you can ignore this email and nothing will happen."), cancellationToken);
    }

    /// <summary>Sent when someone registers with an email that already has an account. Only the inbox owner learns that.</summary>
    public async Task SendAlreadyRegisteredAsync(AppUser user, CancellationToken cancellationToken)
    {
        var link = urls.Build("/forgot-password", new Dictionary<string, string?>());

        var spanish = await IsSpanishAsync(user);
        await TrySendAsync(Compose(
            user,
            spanish ? "Ya tienes una cuenta de Parenthesis" : "You already have a Parenthesis account",
            spanish ? "Inicia sesión con este correo electrónico" : "Sign in with this email address",
            [
                spanish ? "Alguien intentó crear una cuenta con este correo, pero ya existe una." : "Someone tried to create a Parenthesis account with this email address, which already has one.",
                spanish ? "Si fuiste tú, inicia sesión con este correo. Si olvidaste tu contraseña, puedes restablecerla." : "If it was you, sign in with this email address. If you've forgotten your password, you can reset it.",
            ],
            new EmailAction(spanish ? "Restablecer contraseña" : "Reset password", link),
            spanish ? "Si no fuiste tú, no necesitas hacer nada. Tu cuenta no cambió." : "If it wasn't you, no action is needed. Your account hasn't changed."), cancellationToken);
    }

    public async Task SendPasswordResetAsync(AppUser user, CancellationToken cancellationToken)
    {
        var token = Encode(await users.GeneratePasswordResetTokenAsync(user));
        var link = urls.Build("/reset-password", new Dictionary<string, string?>
        {
            ["email"] = user.Email,
            ["token"] = token,
        });

        var spanish = await IsSpanishAsync(user);
        await TrySendAsync(Compose(
            user,
            spanish ? "Restablece tu contraseña de Parenthesis" : "Reset your Parenthesis password",
            spanish ? "Elige una nueva contraseña" : "Choose a new password",
            [spanish ? "Recibimos una solicitud para restablecer tu contraseña. El enlace solo se puede usar una vez." : "We received a request to reset your Parenthesis password. The link works once."],
            new EmailAction("Choose a new password", link),
            spanish ? "Si no solicitaste esto, puedes ignorar el mensaje. Tu contraseña no cambiará." : "If you didn't ask for this, you can ignore this email. Your password won't change."), cancellationToken);
    }

    private async Task<bool> IsSpanishAsync(AppUser user) =>
        await UserLanguage.GetAsync(users, user) == UserLanguage.Spanish;

    /// <summary>Identity tokens contain characters that aren't URL-safe, so links carry them base64url-encoded.</summary>
    public static string Encode(string token) => WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(token));

    public static string? Decode(string? token)
    {
        if (string.IsNullOrEmpty(token))
        {
            return null;
        }

        try
        {
            return Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(token));
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private static EmailMessage Compose(
        AppUser user, string subject, string preview, IReadOnlyList<string> paragraphs, EmailAction action, string footer) =>
        EmailTemplate.Render(user.Email!, new EmailContent(subject, preview, user.DisplayName, paragraphs, action, footer));

    private async Task TrySendAsync(EmailMessage message, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(message, cancellationToken);
        }
#pragma warning disable CA1031 // Any delivery failure is logged; the user can request the email again.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, message.Subject);
        }
    }

    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send account email '{Subject}'")]
    private partial void LogSendFailed(Exception exception, string subject);
}
