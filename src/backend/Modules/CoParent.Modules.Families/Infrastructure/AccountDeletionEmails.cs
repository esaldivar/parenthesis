using CoParent.Infrastructure.Email;
using Microsoft.Extensions.Logging;

namespace CoParent.Modules.Families.Infrastructure;

/// <summary>
/// Emails sent when a parent deletes their account (A-12): a confirmation to them, and a neutral notice to each
/// co-parent that names nobody (owner decision, October 20, 2026).
/// </summary>
internal sealed partial class AccountDeletionEmails(IEmailSender sender, PublicUrls urls, ILogger<AccountDeletionEmails> logger)
{
    public Task SendDeletedAsync(string to, CancellationToken cancellationToken, bool spanish = false) =>
        SendAsync(to, new EmailContent(
            spanish ? "Se eliminó tu cuenta de Parenthesis" : "Your Parenthesis account has been deleted",
            spanish ? "Se eliminaron tu cuenta y tus datos personales" : "Your account and personal details are gone",
            null,
            [
                spanish ? "Se eliminó tu cuenta de Parenthesis como lo solicitaste. Se quitaron tu acceso, tu nombre y tus datos privados, y se cerraron todas tus sesiones." : "Your Parenthesis account has been deleted, as you asked. Your sign-in, name and private details are gone, and you've been signed out everywhere.",
                spanish ? "Si compartías una familia con el otro padre o madre, esa persona conserva la familia, los perfiles de los hijos y el historial compartido. Tus aportes aparecen como de un «Padre o madre anterior»." : "If you shared a family with a co-parent, the family, children and shared history stay with them. Anything you added there now shows as \"Former parent\".",
            ],
            new EmailAction(spanish ? "Visitar Parenthesis" : "Visit Parenthesis", urls.Build("/", new Dictionary<string, string?>())),
            spanish ? "Puedes volver cuando quieras y crear otra cuenta con este correo electrónico." : "You're welcome back any time: you can sign up again with this email address.", spanish), cancellationToken);

    public Task SendParentLeftAsync(string to, CancellationToken cancellationToken, bool spanish = false) =>
        SendAsync(to, new EmailContent(
            spanish ? "Un padre o madre salió de tu familia en Parenthesis" : "A parent has left your family on Parenthesis",
            spanish ? "Tu familia, los perfiles de tus hijos y el historial compartido se conservan" : "Your family, children and shared history are unchanged",
            null,
            [
                spanish ? "Un padre o madre salió de tu familia en Parenthesis. Tu familia, los perfiles de tus hijos y el historial compartido se conservan." : "A parent has left your family on Parenthesis. Your family, children and shared history are unchanged.",
                spanish ? "Sus aportes aparecen como de un «Padre o madre anterior». Se retiraron sus solicitudes pendientes." : "Anything they added now shows as \"Former parent\". Requests they were still waiting on were withdrawn.",
            ],
            new EmailAction(spanish ? "Abrir Parenthesis" : "Open Parenthesis", urls.Build("/", new Dictionary<string, string?>())),
            spanish ? "Cuando quieras, puedes enviar otra invitación desde Configuración." : "You can invite a co-parent again from Settings whenever you're ready.", spanish), cancellationToken);

    private async Task SendAsync(string to, EmailContent content, CancellationToken cancellationToken)
    {
        try
        {
            await sender.SendAsync(EmailTemplate.Render(to, content), cancellationToken);
        }
#pragma warning disable CA1031 // Delivery failures are logged; the deletion itself is already complete.
        catch (Exception exception) when (exception is not OperationCanceledException)
#pragma warning restore CA1031
        {
            LogSendFailed(exception, content.Subject);
        }
    }

    // The subject only: never the address (no personal data in logs).
    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to send an account-deletion email: {Subject}")]
    private partial void LogSendFailed(Exception exception, string subject);
}
