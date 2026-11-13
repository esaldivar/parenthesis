using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCalendarNoteChildren : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid[]>(
                name: "child_profile_ids",
                schema: "calendar",
                table: "reminders",
                type: "uuid[]",
                nullable: true);

            migrationBuilder.AddColumn<Guid[]>(
                name: "child_profile_ids",
                schema: "calendar",
                table: "tasks",
                type: "uuid[]",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "child_profile_ids",
                schema: "calendar",
                table: "reminders");

            migrationBuilder.DropColumn(
                name: "child_profile_ids",
                schema: "calendar",
                table: "tasks");
        }
    }
}
