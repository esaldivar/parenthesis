using CoParent.Modules.Identity.Domain;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;

namespace CoParent.Modules.Identity.Endpoints;

internal sealed record ConfirmEmailRequest(Guid? UserId, string? Token);

internal sealed record EmailRequest(string? Email);

internal sealed record ResetPasswordRequest(string? Email, string? Token, string? Password);

/// <summary>
/// Email confirmation and password reset. Endpoints that take only an email always answer 202, so they can't be
/// used to find out which addresses have accounts.
/// </summary>
internal static class AccountRecoveryEndpoints
{
    public static void Map(RouteGroupBuilder anonymousAuth)
    {
        anonymousAuth.MapPost("/confirm-email", ConfirmEmailAsync);
        anonymousAuth.MapPost("/resend-confirmation", ResendConfirmationAsync);
        anonymousAuth.MapPost("/forgot-password", ForgotPasswordAsync);
        anonymousAuth.MapPost("/reset-password", ResetPasswordAsync);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> ConfirmEmailAsync(
        ConfirmEmailRequest request, UserManager<AppUser> users)
    {
        var token = AccountEmails.Decode(request.Token);
        var user = request.UserId is { } id ? await users.FindByIdAsync(id.ToString()) : null;
        if (user is null || token is null)
        {
            return InvalidLink();
        }

        var result = await users.ConfirmEmailAsync(user, token);
        return result.Succeeded ? TypedResults.NoContent() : InvalidLink();
    }

    private static async Task<Accepted> ResendConfirmationAsync(
        EmailRequest request, UserManager<AppUser> users, AccountEmails emails, CancellationToken cancellationToken)
    {
        var user = await FindByEmailAsync(users, request.Email);
        if (user is { EmailConfirmed: false })
        {
            await emails.SendConfirmationAsync(user, cancellationToken);
        }

        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Accepted> ForgotPasswordAsync(
        EmailRequest request, UserManager<AppUser> users, AccountEmails emails, CancellationToken cancellationToken)
    {
        var user = await FindByEmailAsync(users, request.Email);
        if (user is not null)
        {
            await emails.SendPasswordResetAsync(user, cancellationToken);
        }

        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<NoContent, ValidationProblem, ProblemHttpResult>> ResetPasswordAsync(
        ResetPasswordRequest request, UserManager<AppUser> users)
    {
        var token = AccountEmails.Decode(request.Token);
        var user = await FindByEmailAsync(users, request.Email);
        if (user is null || token is null)
        {
            return InvalidLink();
        }

        if (string.IsNullOrEmpty(request.Password))
        {
            return TypedResults.ValidationProblem(new Dictionary<string, string[]> { ["password"] = ["Enter a password."] });
        }

        // Also rotates the security stamp, which invalidates the token and signs out other sessions.
        var result = await users.ResetPasswordAsync(user, token, request.Password);
        if (!result.Succeeded)
        {
            return result.Errors.Any(e => e.Code == nameof(IdentityErrorDescriber.InvalidToken))
                ? InvalidLink()
                : TypedResults.ValidationProblem(AuthEndpoints.ToValidationErrors(result.Errors));
        }

        // Using the emailed link proves the user controls the inbox, and a reset is how a locked-out owner gets back in.
        if (!user.EmailConfirmed)
        {
            user.EmailConfirmed = true;
            await users.UpdateAsync(user);
        }

        await users.SetLockoutEndDateAsync(user, null);
        await users.ResetAccessFailedCountAsync(user);
        return TypedResults.NoContent();
    }

    private static async Task<AppUser?> FindByEmailAsync(UserManager<AppUser> users, string? email) =>
        string.IsNullOrWhiteSpace(email) ? null : await users.FindByEmailAsync(email.Trim());

    private static ProblemHttpResult InvalidLink() =>
        TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "This link is invalid or has expired.");
}
