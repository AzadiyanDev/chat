using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace azadiyanChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddChatParticipantLastReadAt : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "LastReadAt",
                table: "ChatParticipants",
                type: "datetime2",
                nullable: false,
                defaultValueSql: "SYSUTCDATETIME()");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "LastReadAt",
                table: "ChatParticipants");
        }
    }
}
