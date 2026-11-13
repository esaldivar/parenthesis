using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Messaging.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChatTranscripts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "transcripts",
                schema: "messaging",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_membership_id = table.Column<Guid>(type: "uuid", nullable: false),
                    file_name = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    range_from = table.Column<DateOnly>(type: "date", nullable: true),
                    range_to = table.Column<DateOnly>(type: "date", nullable: true),
                    range_label = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    message_count = table.Column<int>(type: "integer", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    pdf = table.Column<byte[]>(type: "bytea", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_transcripts", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_transcripts_family_id_owner_membership_id_created_at",
                schema: "messaging",
                table: "transcripts",
                columns: new[] { "family_id", "owner_membership_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "transcripts",
                schema: "messaging");
        }
    }
}
