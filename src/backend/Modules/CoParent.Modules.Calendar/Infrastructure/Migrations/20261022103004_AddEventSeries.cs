using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventSeries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "series_id",
                schema: "calendar",
                table: "events",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "series",
                schema: "calendar",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    category = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    owner_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    days = table.Column<int>(type: "integer", nullable: false),
                    until = table.Column<DateOnly>(type: "date", nullable: true),
                    count = table.Column<int>(type: "integer", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_series", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_events_series_id_starts_at",
                schema: "calendar",
                table: "events",
                columns: new[] { "series_id", "starts_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "series",
                schema: "calendar");

            migrationBuilder.DropIndex(
                name: "ix_events_series_id_starts_at",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "series_id",
                schema: "calendar",
                table: "events");
        }
    }
}
