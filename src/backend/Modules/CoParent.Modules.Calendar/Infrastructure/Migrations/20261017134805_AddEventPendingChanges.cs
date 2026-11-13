using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddEventPendingChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pending_change",
                schema: "calendar",
                table: "events",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<bool>(
                name: "proposed_all_day",
                schema: "calendar",
                table: "events",
                type: "boolean",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "proposed_caregiver_membership_id",
                schema: "calendar",
                table: "events",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "proposed_ends_at",
                schema: "calendar",
                table: "events",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "proposed_location",
                schema: "calendar",
                table: "events",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "proposed_starts_at",
                schema: "calendar",
                table: "events",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "proposed_title",
                schema: "calendar",
                table: "events",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "pending_change",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_all_day",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_caregiver_membership_id",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_ends_at",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_location",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_starts_at",
                schema: "calendar",
                table: "events");

            migrationBuilder.DropColumn(
                name: "proposed_title",
                schema: "calendar",
                table: "events");
        }
    }
}
