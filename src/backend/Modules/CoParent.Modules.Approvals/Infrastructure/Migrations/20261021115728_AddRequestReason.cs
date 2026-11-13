using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Approvals.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddRequestReason : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "reason",
                schema: "approvals",
                table: "change_requests",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "reason",
                schema: "approvals",
                table: "change_requests");
        }
    }
}
