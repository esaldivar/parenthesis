using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Migrations;

/// <summary>Assign legacy slots once; future joins allocate under the existing family-row lock.</summary>
public partial class AddParentPaletteSlots : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "palette_slot",
            schema: "families",
            table: "memberships",
            type: "integer",
            nullable: true);
        // Preserve founder A / invited B. If the founder left, the first remaining parent keeps B
        // and a replacement takes A. Inactive historical memberships do not consume active slots.
        migrationBuilder.Sql("""
            UPDATE families.memberships m SET palette_slot =
                CASE WHEN m.joined_at = f.created_at THEN 0 ELSE 1 END
            FROM families.families f WHERE m.family_id = f.id AND m.role = 'Parent';
            WITH ranked AS (
                SELECT m.id, m.family_id, m.joined_at = f.created_at AS founder,
                    row_number() OVER (PARTITION BY m.family_id ORDER BY m.joined_at, m.id) AS rn
                FROM families.memberships m JOIN families.families f ON f.id = m.family_id
                WHERE m.role = 'Parent' AND m.status = 'Active'
            ), slots AS (
                SELECT id, CASE WHEN first_value(founder) OVER
                    (PARTITION BY family_id ORDER BY rn) THEN (rn - 1)::integer
                    ELSE (2 - rn)::integer END AS slot FROM ranked
            )
            UPDATE families.memberships m SET palette_slot = slots.slot FROM slots WHERE m.id = slots.id;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "palette_slot", schema: "families", table: "memberships");
    }
}
