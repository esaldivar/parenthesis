using System.Net.Mail;
using System.Security.Claims;
using CoParent.Modules.Identity.Domain;
using CoParent.SharedKernel.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Options;

namespace CoParent.Modules.Identity.Endpoints;

internal sealed record RegisterRequest(string? Email, string? Password, string? DisplayName);

internal sealed record LoginRequest(string? Email, string? Password);

internal sealed record MeResponse(Guid Id, string Email, string DisplayName);

/// <summary>
/// Cookie sign-in for the same-origin SPA (ADR-0004). Responses never reveal whether an email is registered:
/// registering an existing email looks like success, and every failed sign-in gets the same 401.
/// </summary>
internal static class AuthEndpoints
{
    public const string RateLimitPolicy = "identity-auth";

    public static void Map(IEndpointRouteBuilder api)
    {
        var anonymous = api.MapGroup("/auth").WithTags("Auth").AllowAnonymous().RequireRateLimiting(RateLimitPolicy);
        anonymous.MapPost("/register", RegisterAsync);
        anonymous.MapPost("/login", LoginAsync);
        AccountRecoveryEndpoints.Map(anonymous);

        api.MapPost("/auth/logout", LogoutAsync).WithTags("Auth").WithMetadata(new ChildSessionAllowed());
        api.MapGet("/me", MeAsync).WithTags("Me");
    }

    private static async Task<Results<Accepted, ValidationProblem, ProblemHttpResult>> RegisterAsync(
        RegisterRequest request,
        UserManager<AppUser> users,
        AccountEmails emails,
        IOptions<SignUpOptions> signUp,
        TimeProvider clock,
        CancellationToken cancellationToken)
    {
        var errors = Validate(request);
        if (errors.Count > 0)
        {
            return TypedResults.ValidationProblem(errors);
        }

        var email = request.Email!.Trim();
        if (!signUp.Value.Allows(email))
        {
            // Checked before anything else, so it says nothing about whether an account exists.
            return TypedResults.Problem(
                title: "Sign-up here is by invitation only.",
                detail: "This is a test site. Ask the Parenthesis team to add your email address.",
                statusCode: StatusCodes.Status403Forbidden);
        }

        var user = new AppUser
        {
            UserName = email,
            Email = email,
            DisplayName = request.DisplayName!.Trim(),
            CreatedAt = clock.GetUtcNow(),
        };

        var result = await users.CreateAsync(user, request.Password!);

        // A duplicate email is reported exactly like success, so the endpoint can't be used to find accounts.
        var remaining = result.Errors.Where(e => e.Code is not (nameof(IdentityErrorDescriber.DuplicateEmail)
            or nameof(IdentityErrorDescriber.DuplicateUserName))).ToList();

        if (remaining.Count > 0)
        {
            return TypedResults.ValidationProblem(ToValidationErrors(remaining));
        }

        if (result.Succeeded)
        {
            await emails.SendConfirmationAsync(user, cancellationToken);
        }
        else if (await users.FindByEmailAsync(email) is { } existing)
        {
            // Tell the inbox owner, not the caller: confirmed accounts get a notice, unconfirmed ones a fresh link.
            await (existing.EmailConfirmed
                ? emails.SendAlreadyRegisteredAsync(existing, cancellationToken)
                : emails.SendConfirmationAsync(existing, cancellationToken));
        }

        return TypedResults.Accepted((string?)null);
    }

    private static async Task<Results<NoContent, ProblemHttpResult>> LoginAsync(
        LoginRequest request, SignInManager<AppUser> signIn)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            return InvalidCredentials();
        }

        // Locked-out, unknown and wrong-password attempts all get the same response.
        var result = await signIn.PasswordSignInAsync(
            request.Email.Trim(), request.Password, isPersistent: true, lockoutOnFailure: true);

        return result.Succeeded ? TypedResults.NoContent() : InvalidCredentials();
    }

    private static async Task<NoContent> LogoutAsync(SignInManager<AppUser> signIn)
    {
        await signIn.SignOutAsync();
        return TypedResults.NoContent();
    }

    private static async Task<Results<Ok<MeResponse>, UnauthorizedHttpResult>> MeAsync(
        ClaimsPrincipal principal, UserManager<AppUser> users)
    {
        var user = await users.GetUserAsync(principal);
        return user is null
            ? TypedResults.Unauthorized()
            : TypedResults.Ok(new MeResponse(user.Id, user.Email!, user.DisplayName));
    }

    private static ProblemHttpResult InvalidCredentials() =>
        TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Invalid email or password.");

    private static Dictionary<string, string[]> Validate(RegisterRequest request)
    {
        var errors = new Dictionary<string, string[]>();

        if (string.IsNullOrWhiteSpace(request.Email) || !MailAddress.TryCreate(request.Email.Trim(), out _))
        {
            errors["email"] = ["Enter a valid email address."];
        }

        if (string.IsNullOrEmpty(request.Password))
        {
            errors["password"] = ["Enter a password."];
        }

        var displayName = request.DisplayName?.Trim();
        if (string.IsNullOrEmpty(displayName) || displayName.Length > AppUser.DisplayNameMaxLength)
        {
            errors["displayName"] = [$"Enter a name of 1 to {AppUser.DisplayNameMaxLength} characters."];
        }

        return errors;
    }

    internal static Dictionary<string, string[]> ToValidationErrors(IEnumerable<IdentityError> errors) => errors
        .GroupBy(e => e.Code.StartsWith("Password", StringComparison.Ordinal) ? "password" : "email")
        .ToDictionary(g => g.Key, g => g.Select(e => e.Description).ToArray());
}
