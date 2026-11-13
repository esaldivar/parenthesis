using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Memories.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddGooglePhotosExport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "google_photos_connections",
                schema: "memories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    protected_refresh_token = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    problem = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    connected_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_photos_connections", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "google_photos_albums",
                schema: "memories",
                columns: table => new
                {
                    connection_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    google_album_id = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_photos_albums", x => new { x.connection_id, x.event_id });
                    table.ForeignKey(
                        name: "fk_google_photos_albums_google_photos_connections_connection_id",
                        column: x => x.connection_id,
                        principalSchema: "memories",
                        principalTable: "google_photos_connections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "photo_exports",
                schema: "memories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    connection_id = table.Column<Guid>(type: "uuid", nullable: false),
                    photo_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    state = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    reason = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    upload_token = table.Column<string>(type: "character varying(4096)", maxLength: 4096, nullable: true),
                    upload_token_expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    google_media_item_id = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    next_attempt_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_photo_exports", x => x.id);
                    table.ForeignKey(
                        name: "fk_photo_exports_event_photos_photo_id",
                        column: x => x.photo_id,
                        principalSchema: "memories",
                        principalTable: "event_photos",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_photo_exports_google_photos_connections_connection_id",
                        column: x => x.connection_id,
                        principalSchema: "memories",
                        principalTable: "google_photos_connections",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_google_photos_connections_membership_id",
                schema: "memories",
                table: "google_photos_connections",
                column: "membership_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_photo_exports_connection_id_event_id",
                schema: "memories",
                table: "photo_exports",
                columns: new[] { "connection_id", "event_id" });

            migrationBuilder.CreateIndex(
                name: "ix_photo_exports_connection_id_photo_id",
                schema: "memories",
                table: "photo_exports",
                columns: new[] { "connection_id", "photo_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_photo_exports_photo_id",
                schema: "memories",
                table: "photo_exports",
                column: "photo_id");

            migrationBuilder.CreateIndex(
                name: "ix_photo_exports_state_next_attempt_at",
                schema: "memories",
                table: "photo_exports",
                columns: new[] { "state", "next_attempt_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "google_photos_albums",
                schema: "memories");

            migrationBuilder.DropTable(
                name: "photo_exports",
                schema: "memories");

            migrationBuilder.DropTable(
                name: "google_photos_connections",
                schema: "memories");
        }
    }
}
