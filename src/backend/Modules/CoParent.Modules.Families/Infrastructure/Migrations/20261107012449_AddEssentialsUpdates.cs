using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEssentialsUpdates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "essentials_updates",
                schema: "families",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recipient_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    child_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    section = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    revision = table.Column<int>(type: "integer", nullable: false),
                    fields = table.Column<List<string>>(type: "text[]", nullable: false),
                    pending_fields = table.Column<List<string>>(type: "text[]", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    nav_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    section_seen_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_essentials_updates", x => x.id);
                    table.ForeignKey(
                        name: "fk_essentials_updates_child_profiles_child_profile_id",
                        column: x => x.child_profile_id,
                        principalSchema: "families",
                        principalTable: "child_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_essentials_updates_memberships_recipient_membership_id",
                        column: x => x.recipient_membership_id,
                        principalSchema: "families",
                        principalTable: "memberships",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_essentials_updates_child_profile_id",
                schema: "families",
                table: "essentials_updates",
                column: "child_profile_id");

            migrationBuilder.CreateIndex(
                name: "ix_essentials_updates_recipient_membership_id_child_profile_id",
                schema: "families",
                table: "essentials_updates",
                columns: new[] { "recipient_membership_id", "child_profile_id", "section", "revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "essentials_updates",
                schema: "families");
        }
    }
}
