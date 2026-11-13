using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddChildSchoolRevisions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "child_school_revisions",
                schema: "families",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    child_profile_id = table.Column<Guid>(type: "uuid", nullable: false),
                    revision = table.Column<int>(type: "integer", nullable: false),
                    edited_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    edited_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    grade = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    homeroom_teacher = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    parent_concerns = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_child_school_revisions", x => x.id);
                    table.ForeignKey(
                        name: "fk_child_school_revisions_child_profiles_child_profile_id",
                        column: x => x.child_profile_id,
                        principalSchema: "families",
                        principalTable: "child_profiles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_child_school_revisions_child_profile_id_revision",
                schema: "families",
                table: "child_school_revisions",
                columns: new[] { "child_profile_id", "revision" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "child_school_revisions",
                schema: "families");
        }
    }
}
