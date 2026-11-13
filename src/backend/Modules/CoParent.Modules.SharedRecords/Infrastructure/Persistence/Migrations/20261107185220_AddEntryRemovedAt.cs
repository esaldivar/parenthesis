using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.SharedRecords.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddEntryRemovedAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "removed_at",
                schema: "shared_records",
                table: "entries",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "removed_at",
                schema: "shared_records",
                table: "entries");
        }
    }
}
