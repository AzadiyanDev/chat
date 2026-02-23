using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelegramClone.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Messages_ChatId_Timestamp",
                table: "Messages");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ChatId_IsDeleted_Timestamp",
                table: "Messages",
                columns: new[] { "ChatId", "IsDeleted", "Timestamp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Messages_ChatId_IsDeleted_Timestamp",
                table: "Messages");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_ChatId_Timestamp",
                table: "Messages",
                columns: new[] { "ChatId", "Timestamp" });
        }
    }
}
