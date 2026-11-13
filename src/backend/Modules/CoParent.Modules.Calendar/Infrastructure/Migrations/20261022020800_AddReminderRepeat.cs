using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddReminderRepeat : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "repeat",
                schema: "calendar",
                table: "reminders",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "None");

            migrationBuilder.AddColumn<int>(
                name: "repeat_count",
                schema: "calendar",
                table: "reminders",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<DateOnly>(
                name: "repeat_until",
                schema: "calendar",
                table: "reminders",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "series_ends_at",
                schema: "calendar",
                table: "reminders",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            // Existing reminders are one-offs: their series ends where it starts.
            migrationBuilder.Sql("UPDATE calendar.reminders SET series_ends_at = starts_at;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "repeat",
                schema: "calendar",
                table: "reminders");

            migrationBuilder.DropColumn(
                name: "repeat_count",
                schema: "calendar",
                table: "reminders");

            migrationBuilder.DropColumn(
                name: "repeat_until",
                schema: "calendar",
                table: "reminders");

            migrationBuilder.DropColumn(
                name: "series_ends_at",
                schema: "calendar",
                table: "reminders");
        }
    }
}
