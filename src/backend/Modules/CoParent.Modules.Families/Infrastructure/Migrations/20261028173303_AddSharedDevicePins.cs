using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSharedDevicePins : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "expires_at",
                schema: "families",
                table: "devices",
                type: "timestamp with time zone",
                nullable: true);

            // #153: a shared household device works for a fixed 30 days from setup. Devices registered earlier get the
            // same rule, counted from when they were registered; a child's paired tablet has no expiry.
            migrationBuilder.Sql(
                "UPDATE families.devices SET expires_at = created_at + INTERVAL '30 days' WHERE kind = 'Household';");

            migrationBuilder.AddColumn<long>(
                name: "check_count",
                schema: "families",
                table: "child_credentials",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "paused_until",
                schema: "families",
                table: "child_credentials",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "families",
                table: "child_credentials",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            migrationBuilder.CreateTable(
                name: "parent_credentials",
                schema: "families",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    pin_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    failed_attempts = table.Column<int>(type: "integer", nullable: false),
                    paused_until = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    locked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    check_count = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_parent_credentials", x => x.id);
                    table.ForeignKey(
                        name: "fk_parent_credentials_memberships_membership_id",
                        column: x => x.membership_id,
                        principalSchema: "families",
                        principalTable: "memberships",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_parent_credentials_membership_id",
                schema: "families",
                table: "parent_credentials",
                column: "membership_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "parent_credentials",
                schema: "families");

            migrationBuilder.DropColumn(
                name: "expires_at",
                schema: "families",
                table: "devices");

            migrationBuilder.DropColumn(
                name: "check_count",
                schema: "families",
                table: "child_credentials");

            migrationBuilder.DropColumn(
                name: "paused_until",
                schema: "families",
                table: "child_credentials");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "families",
                table: "child_credentials");
        }
    }
}
