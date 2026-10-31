using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Memories.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventPhotos : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "memories");

            migrationBuilder.CreateTable(
                name: "memory_settings",
                schema: "memories",
                columns: table => new
                {
                    membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    allow_co_parent_download = table.Column<bool>(type: "boolean", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_memory_settings", x => x.membership_id);
                });

            migrationBuilder.CreateTable(
                name: "photo_batches",
                schema: "memories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    uploader_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    visible_to_co_parent = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_photo_batches", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "event_photos",
                schema: "memories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    event_id = table.Column<Guid>(type: "uuid", nullable: false),
                    uploader_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    state = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    width = table.Column<int>(type: "integer", nullable: false),
                    height = table.Column<int>(type: "integer", nullable: false),
                    photo_bytes = table.Column<long>(type: "bigint", nullable: false),
                    thumbnail_bytes = table.Column<long>(type: "bigint", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    removed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_event_photos", x => x.id);
                    table.ForeignKey(
                        name: "fk_event_photos_photo_batches_batch_id",
                        column: x => x.batch_id,
                        principalSchema: "memories",
                        principalTable: "photo_batches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_event_photos_batch_id",
                schema: "memories",
                table: "event_photos",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_event_photos_family_id_event_id_uploader_membership_id_state",
                schema: "memories",
                table: "event_photos",
                columns: new[] { "family_id", "event_id", "uploader_membership_id", "state" });

            migrationBuilder.CreateIndex(
                name: "ix_event_photos_family_id_uploader_membership_id_state",
                schema: "memories",
                table: "event_photos",
                columns: new[] { "family_id", "uploader_membership_id", "state" });

            migrationBuilder.CreateIndex(
                name: "ix_event_photos_state_expires_at",
                schema: "memories",
                table: "event_photos",
                columns: new[] { "state", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "ix_photo_batches_family_id_event_id",
                schema: "memories",
                table: "photo_batches",
                columns: new[] { "family_id", "event_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "event_photos",
                schema: "memories");

            migrationBuilder.DropTable(
                name: "memory_settings",
                schema: "memories");

            migrationBuilder.DropTable(
                name: "photo_batches",
                schema: "memories");
        }
    }
}
