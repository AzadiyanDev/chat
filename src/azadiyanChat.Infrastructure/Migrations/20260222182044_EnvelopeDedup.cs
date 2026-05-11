using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace azadiyanChat.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class EnvelopeDedup : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "EnvelopeId",
                table: "MessageEnvelopes",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "UX_MessageEnvelope_Dest_EnvelopeId",
                table: "MessageEnvelopes",
                columns: new[] { "DestinationDeviceId", "EnvelopeId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "UX_MessageEnvelope_Dest_EnvelopeId",
                table: "MessageEnvelopes");

            migrationBuilder.DropColumn(
                name: "EnvelopeId",
                table: "MessageEnvelopes");
        }
    }
}
