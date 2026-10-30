using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGoogleCalendarSync : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "google_connections",
                schema: "calendar",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    protected_refresh_token = table.Column<string>(type: "text", nullable: false),
                    google_calendar_id = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    problem = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    connected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_synced_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_connections", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "google_synced_events",
                schema: "calendar",
                columns: table => new
                {
                    connection_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    hash = table.Column<string>(type: "character(64)", fixedLength: true, maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_synced_events", x => new { x.connection_id, x.event_id });
                    table.ForeignKey(
                        name: "fk_google_synced_events_google_connections_connection_id",
                        column: x => x.connection_id,
                        principalSchema: "calendar",
                        principalTable: "google_connections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_google_connections_family_id_membership_id",
                schema: "calendar",
                table: "google_connections",
                columns: new[] { "family_id", "membership_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_google_connections_status",
                schema: "calendar",
                table: "google_connections",
                column: "status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "google_synced_events",
                schema: "calendar");

            migrationBuilder.DropTable(
                name: "google_connections",
                schema: "calendar");
        }
    }
}
