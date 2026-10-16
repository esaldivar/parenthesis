using System.Linq.Expressions;
using CoParent.SharedKernel.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace CoParent.ArchitectureTests.Persistence;

/// <summary>Checks on an EF Core model. Each returns a description of every violation; empty means compliant.</summary>
internal static class ModelRules
{
    /// <summary>
    /// ADR-0002: every family-scoped entity has a query filter that reads its <c>FamilyId</c>.
    /// Filters can only be declared on root entity types, so derived types inherit the root's filter.
    /// </summary>
    public static IReadOnlyList<string> FindFamilyScopedEntitiesWithoutTenantFilter(IModel model) => model
        .GetEntityTypes()
        .Where(e => e.BaseType is null && !e.IsOwned() && typeof(IFamilyScoped).IsAssignableFrom(e.ClrType))
        .Where(e => !e.GetDeclaredQueryFilters().Any(f => f.Expression is not null && ReadsFamilyId(f.Expression)))
        .Select(e => $"{e.DisplayName()} has no query filter on {nameof(IFamilyScoped.FamilyId)}")
        .ToList();

    /// <summary>ADR-0001: a module's tables all live in that module's schema.</summary>
    public static IReadOnlyList<string> FindTablesOutsideSchema(IModel model, string schema)
    {
        var violations = new List<string>();
        if (model.GetDefaultSchema() != schema)
        {
            violations.Add($"default schema is '{model.GetDefaultSchema() ?? "(none)"}', expected '{schema}'");
        }

        violations.AddRange(model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null && e.GetSchema() != schema)
            .Select(e => $"{e.DisplayName()} is in schema '{e.GetSchema() ?? "(none)"}', expected '{schema}'"));

        return violations;
    }

    private static bool ReadsFamilyId(LambdaExpression filter)
    {
        var finder = new FamilyIdAccessFinder();
        finder.Visit(filter.Body);
        return finder.Found;
    }

    private sealed class FamilyIdAccessFinder : ExpressionVisitor
    {
        public bool Found { get; private set; }

        protected override Expression VisitMember(MemberExpression node)
        {
            if (node.Member.Name == nameof(IFamilyScoped.FamilyId) && node.Expression is ParameterExpression)
            {
                Found = true;
            }

            return base.VisitMember(node);
        }
    }
}
