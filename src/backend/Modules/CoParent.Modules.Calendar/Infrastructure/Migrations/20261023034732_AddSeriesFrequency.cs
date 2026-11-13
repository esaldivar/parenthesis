using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSeriesFrequency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Series made before #238 repeat every week on their chosen days.
            migrationBuilder.AddColumn<string>(
                name: "frequency",
                schema: "calendar",
                table: "series",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "Weekly");

            migrationBuilder.AddColumn<int>(
                name: "interval",
                schema: "calendar",
                table: "series",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "frequency",
                schema: "calendar",
                table: "series");

            migrationBuilder.DropColumn(
                name: "interval",
                schema: "calendar",
                table: "series");
        }
    }
}
