using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventEndsAtIndex : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "ix_events_family_id_ends_at",
                schema: "calendar",
                table: "events",
                columns: new[] { "family_id", "ends_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_events_family_id_ends_at",
                schema: "calendar",
                table: "events");
        }
    }
}
