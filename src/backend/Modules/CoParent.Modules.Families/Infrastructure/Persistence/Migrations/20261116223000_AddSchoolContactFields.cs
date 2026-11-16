using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSchoolContactFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "school_name",
                schema: "families",
                table: "child_school_revisions",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "school_address",
                schema: "families",
                table: "child_school_revisions",
                type: "character varying(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "teacher_email",
                schema: "families",
                table: "child_school_revisions",
                type: "character varying(254)",
                maxLength: 254,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "teacher_phone",
                schema: "families",
                table: "child_school_revisions",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "school_name",
                schema: "families",
                table: "child_school_revisions");

            migrationBuilder.DropColumn(
                name: "school_address",
                schema: "families",
                table: "child_school_revisions");

            migrationBuilder.DropColumn(
                name: "teacher_email",
                schema: "families",
                table: "child_school_revisions");

            migrationBuilder.DropColumn(
                name: "teacher_phone",
                schema: "families",
                table: "child_school_revisions");
        }
    }
}
