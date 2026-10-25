using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CoParent.Modules.Calendar.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskChecklists : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "updated_at",
                schema: "calendar",
                table: "tasks",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTimeOffset(new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)));

            migrationBuilder.AddColumn<uint>(
                name: "xmin",
                schema: "calendar",
                table: "tasks",
                type: "xid",
                rowVersion: true,
                nullable: false,
                defaultValue: 0u);

            // Existing tasks last changed when they were created (or edited, or marked done).
            migrationBuilder.Sql(
                "UPDATE calendar.tasks SET updated_at = GREATEST(created_at, COALESCE(last_edited_at, created_at), COALESCE(completed_at, created_at), COALESCE(deleted_at, created_at));");

            migrationBuilder.CreateTable(
                name: "task_checklist_items",
                schema: "calendar",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    family_id = table.Column<Guid>(type: "uuid", nullable: false),
                    task_id = table.Column<Guid>(type: "uuid", nullable: false),
                    text = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    required = table.Column<bool>(type: "boolean", nullable: false),
                    position = table.Column<int>(type: "integer", nullable: false),
                    completed_by_membership_id = table.Column<Guid>(type: "uuid", nullable: true),
                    completed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_task_checklist_items", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "ix_task_checklist_items_task_id_position",
                schema: "calendar",
                table: "task_checklist_items",
                columns: new[] { "task_id", "position" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "task_checklist_items",
                schema: "calendar");

            migrationBuilder.DropColumn(
                name: "updated_at",
                schema: "calendar",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "xmin",
                schema: "calendar",
                table: "tasks");
        }
    }
}
