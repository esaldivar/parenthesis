using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Memories.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddGooglePhotosQuotaDays : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "google_photos_quota_days",
                schema: "memories",
                columns: table => new
                {
                    day = table.Column<DateOnly>(type: "date", nullable: false),
                    requests = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_google_photos_quota_days", x => x.day);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "google_photos_quota_days",
                schema: "memories");
        }
    }
}
