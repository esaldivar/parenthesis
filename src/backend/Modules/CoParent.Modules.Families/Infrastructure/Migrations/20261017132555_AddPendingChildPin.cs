using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Families.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPendingChildPin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pending_pin_hash",
                schema: "families",
                table: "child_credentials",
                type: "character varying(256)",
                maxLength: 256,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pending_pin_hash",
                schema: "families",
                table: "child_credentials");
        }
    }
}
