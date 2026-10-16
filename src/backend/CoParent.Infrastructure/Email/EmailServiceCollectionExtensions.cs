using Microsoft.Extensions.DependencyInjection;

namespace CoParent.Infrastructure.Email;

public static class EmailServiceCollectionExtensions
{
    public static IServiceCollection AddEmail(this IServiceCollection services)
    {
        services.AddOptions<EmailOptions>().BindConfiguration(EmailOptions.Section);
        services.AddOptions<PublicUrlOptions>().BindConfiguration(PublicUrlOptions.Section);
        services.AddSingleton<IEmailSender, SmtpEmailSender>();
        services.AddSingleton<PublicUrls>();
        return services;
    }
}
