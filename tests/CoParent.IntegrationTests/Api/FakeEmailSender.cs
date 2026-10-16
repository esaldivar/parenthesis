using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using CoParent.Infrastructure.Email;

namespace CoParent.IntegrationTests.Api;

/// <summary>Captures outgoing email instead of sending it.</summary>
public sealed partial class FakeEmailSender : IEmailSender
{
    private readonly ConcurrentQueue<EmailMessage> _sent = new();

    public Task SendAsync(EmailMessage message, CancellationToken cancellationToken = default)
    {
        _sent.Enqueue(message);
        return Task.CompletedTask;
    }

    public IReadOnlyList<EmailMessage> SentTo(string address) =>
        _sent.Where(m => string.Equals(m.To, address, StringComparison.OrdinalIgnoreCase)).ToList();

    /// <summary>The single link in the newest email to <paramref name="address"/> whose subject contains <paramref name="subjectPart"/>.</summary>
    public Uri LatestLink(string address, string subjectPart)
    {
        var message = SentTo(address).Last(m => m.Subject.Contains(subjectPart, StringComparison.OrdinalIgnoreCase));
        return new Uri(Assert.Single(LinkPattern().Matches(message.TextBody)).Value);
    }

    [GeneratedRegex(@"https?://\S+")]
    private static partial Regex LinkPattern();
}
