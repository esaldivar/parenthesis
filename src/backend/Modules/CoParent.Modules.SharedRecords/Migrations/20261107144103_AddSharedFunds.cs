using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.SharedRecords.Migrations
{
    /// <inheritdoc />
    public partial class AddSharedFunds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "shared_records");

            migrationBuilder.CreateTable(
                name: "funds",
                schema: "shared_records",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    proposer_id = table.Column<Guid>(type: "uuid", nullable: false),
                    co_parent_id = table.Column<Guid>(type: "uuid", nullable: false),
                    title = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    proposer_share_minor = table.Column<long>(type: "bigint", nullable: false),
                    co_parent_share_minor = table.Column<long>(type: "bigint", nullable: false),
                    child_ids = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    approval_id = table.Column<Guid>(type: "uuid", nullable: false),
                    status = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_funds", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_funds_family_id_created_at",
                schema: "shared_records",
                table: "funds",
                columns: new[] { "family_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "funds",
                schema: "shared_records");
        }
    }
}
