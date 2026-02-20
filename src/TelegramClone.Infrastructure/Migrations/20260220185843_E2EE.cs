using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TelegramClone.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class E2EE : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "DeviceRegistrations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<int>(type: "int", nullable: false),
                    DeviceName = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastActiveAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DeviceRegistrations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeviceRegistrations_DomainUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EncryptedAttachments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploaderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    StoragePath = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    CiphertextSize = table.Column<long>(type: "bigint", nullable: false),
                    ChunksUploaded = table.Column<int>(type: "int", nullable: false),
                    TotalChunks = table.Column<int>(type: "int", nullable: false),
                    IsComplete = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncryptedAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncryptedAttachments_DomainUsers_UploaderId",
                        column: x => x.UploaderId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "IdentityKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<int>(type: "int", nullable: false),
                    RegistrationId = table.Column<int>(type: "int", nullable: false),
                    PublicIdentityKey = table.Column<byte[]>(type: "varbinary(33)", maxLength: 33, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdentityKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_IdentityKeys_DomainUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "KyberPreKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<int>(type: "int", nullable: false),
                    KeyId = table.Column<int>(type: "int", nullable: false),
                    PublicKey = table.Column<byte[]>(type: "varbinary(1600)", maxLength: 1600, nullable: false),
                    Signature = table.Column<byte[]>(type: "varbinary(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KyberPreKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KyberPreKeys_DomainUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MessageEnvelopes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DestinationUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DestinationDeviceId = table.Column<int>(type: "int", nullable: false),
                    Type = table.Column<int>(type: "int", nullable: false),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    ServerTimestamp = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsDelivered = table.Column<bool>(type: "bit", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    SourceUserId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceDeviceId = table.Column<int>(type: "int", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MessageEnvelopes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MessageEnvelopes_DomainUsers_DestinationUserId",
                        column: x => x.DestinationUserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OneTimePreKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<int>(type: "int", nullable: false),
                    KeyId = table.Column<int>(type: "int", nullable: false),
                    PublicKey = table.Column<byte[]>(type: "varbinary(33)", maxLength: 33, nullable: false),
                    IsConsumed = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OneTimePreKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OneTimePreKeys_DomainUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SignedPreKeys",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DeviceId = table.Column<int>(type: "int", nullable: false),
                    KeyId = table.Column<int>(type: "int", nullable: false),
                    PublicKey = table.Column<byte[]>(type: "varbinary(33)", maxLength: 33, nullable: false),
                    Signature = table.Column<byte[]>(type: "varbinary(64)", maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SignedPreKeys", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SignedPreKeys_DomainUsers_UserId",
                        column: x => x.UserId,
                        principalTable: "DomainUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DeviceRegistrations_UserId_DeviceId",
                table: "DeviceRegistrations",
                columns: new[] { "UserId", "DeviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EncryptedAttachments_ExpiresAt",
                table: "EncryptedAttachments",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_EncryptedAttachments_UploaderId",
                table: "EncryptedAttachments",
                column: "UploaderId");

            migrationBuilder.CreateIndex(
                name: "IX_IdentityKeys_UserId_DeviceId",
                table: "IdentityKeys",
                columns: new[] { "UserId", "DeviceId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KyberPreKeys_UserId_DeviceId_KeyId",
                table: "KyberPreKeys",
                columns: new[] { "UserId", "DeviceId", "KeyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MessageEnvelopes_DestinationUserId_DestinationDeviceId_IsDelivered",
                table: "MessageEnvelopes",
                columns: new[] { "DestinationUserId", "DestinationDeviceId", "IsDelivered" });

            migrationBuilder.CreateIndex(
                name: "IX_MessageEnvelopes_ExpiresAt",
                table: "MessageEnvelopes",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_OneTimePreKeys_UserId_DeviceId_IsConsumed",
                table: "OneTimePreKeys",
                columns: new[] { "UserId", "DeviceId", "IsConsumed" });

            migrationBuilder.CreateIndex(
                name: "IX_OneTimePreKeys_UserId_DeviceId_KeyId",
                table: "OneTimePreKeys",
                columns: new[] { "UserId", "DeviceId", "KeyId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SignedPreKeys_UserId_DeviceId_KeyId",
                table: "SignedPreKeys",
                columns: new[] { "UserId", "DeviceId", "KeyId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DeviceRegistrations");

            migrationBuilder.DropTable(
                name: "EncryptedAttachments");

            migrationBuilder.DropTable(
                name: "IdentityKeys");

            migrationBuilder.DropTable(
                name: "KyberPreKeys");

            migrationBuilder.DropTable(
                name: "MessageEnvelopes");

            migrationBuilder.DropTable(
                name: "OneTimePreKeys");

            migrationBuilder.DropTable(
                name: "SignedPreKeys");
        }
    }
}
