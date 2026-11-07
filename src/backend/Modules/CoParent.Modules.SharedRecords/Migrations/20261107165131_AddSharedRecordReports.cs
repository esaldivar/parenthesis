using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.SharedRecords.Migrations
{
    /// <inheritdoc />
    public partial class AddSharedRecordReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "entries",
                schema: "shared_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    record_kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    record_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reporter_id = table.Column<Guid>(type: "uuid", nullable: false),
                    responder_id = table.Column<Guid>(type: "uuid", nullable: false),
                    amount_minor = table.Column<long>(type: "bigint", nullable: false),
                    paid_on = table.Column<DateOnly>(type: "date", nullable: false),
                    paid_to = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    submitted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    client_request_id = table.Column<Guid>(type: "uuid", nullable: false),
                    attachment_path = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    attachment_type = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    attachment_bytes = table.Column<int>(type: "integer", nullable: false),
                    status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    responded_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_entries", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "support_records",
                schema: "shared_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    payer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    recipient_id = table.Column<Guid>(type: "uuid", nullable: false),
                    reference_minor = table.Column<long>(type: "bigint", nullable: true),
                    created_by_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_support_records", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_entries_family_id_record_id_submitted_at",
                schema: "shared_records",
                table: "entries",
                columns: new[] { "family_id", "record_id", "submitted_at" });

            migrationBuilder.CreateIndex(
                name: "ix_entries_record_id_reporter_id_client_request_id",
                schema: "shared_records",
                table: "entries",
                columns: new[] { "record_id", "reporter_id", "client_request_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_support_records_family_id_created_at",
                schema: "shared_records",
                table: "support_records",
                columns: new[] { "family_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "entries",
                schema: "shared_records");

            migrationBuilder.DropTable(
                name: "support_records",
                schema: "shared_records");
        }
    }
}
