# TelegramClone (AzadiyanChat)

این مخزن یک نمونه‌ی نسبتاً کامل از یک پیام‌رسان شبیه تلگرام است که با معماری چندلایه‌ی .NET در بک‌اند و Angular در فرانت‌اند پیاده‌سازی شده و هم‌زمان چند مسیر پیام‌رسانی را پوشش می‌دهد:

- چت معمولی (پیام متنی، واکنش، فوروارد، حذف، فایل، ویس)
- Real-time با SignalR
- هسته‌ی E2EE چنددستگاهی (Device/KeyBundle/Envelope)
- زیرساخت فایل‌های رمز‌شده و Saved Messages Crypto
- PWA + Service Worker

## 1. معماری کلان پروژه

پروژه به‌صورت Solution چندپروژه‌ای با `TelegramClone.slnx` مدیریت می‌شود:

| لایه | پروژه | مسئولیت |
|---|---|---|
| Domain | `src/TelegramClone.Domain` | مدل‌های دامنه، enumها، قرارداد ریپازیتوری‌ها |
| Application | `src/TelegramClone.Application` | DTOها، اینترفیس سرویس‌ها، منطق Use Case |
| Infrastructure | `src/TelegramClone.Infrastructure` | EF Core + Identity + ریپازیتوری‌ها + سرویس‌های ذخیره‌سازی |
| Web/API | `src/TelegramClone.Web` | Web API، SignalR Hub، Middleware، میزبانی SPA |
| Frontend | `src/TelegramClone.Web/ClientApp` | اپ Angular (Standalone + Zoneless) |

Dependency direction رعایت شده:

- `Web -> Application + Infrastructure`
- `Infrastructure -> Application + Domain`
- `Application -> Domain`
- `Domain` مستقل

## 2. تکنولوژی‌ها

### Backend

- .NET SDK: `10.0.102`
- ASP.NET Core Web API
- Entity Framework Core `10.0.3` (SQL Server)
- ASP.NET Core Identity
- AutoMapper
- FluentValidation DI
- SignalR
- Rate Limiting middleware

### Frontend

- Angular `21.x` (Standalone components)
- RxJS
- SignalR client (`@microsoft/signalr`)
- GSAP
- libsodium + libsignal-protocol-typescript + argon2-browser
- PWA (`@angular/service-worker`)

## 3. پیش‌نیاز اجرا

- .NET 10 SDK
- Node.js 22+ و npm 10+
- SQL Server LocalDB یا SQL Server معمولی

## 4. راه‌اندازی پروژه

## 4.1 اجرای بک‌اند

از ریشه:

```bash
dotnet build TelegramClone.slnx
dotnet run --project src/TelegramClone.Web
```

Database migration در شروع برنامه به‌صورت خودکار اجرا می‌شود (`SeedData.InitializeAsync`).

Profileهای پیش‌فرض در `launchSettings.json`:

- `https://localhost:7228`
- `http://localhost:5045`

## 4.2 اجرای فرانت‌اند (Angular)

```bash
cd src/TelegramClone.Web/ClientApp
npm install
npm run start
```

فرانت روی `http://localhost:4200` بالا می‌آید.

نکته‌ی مهم: `proxy.conf.json` فعلاً backend را روی `https://localhost:5001` هدف گرفته است. اگر API را با پروفایل فعلی (`7228`) بالا می‌آورید، یکی از این کارها لازم است:

- یا `proxy.conf.json` را به `https://localhost:7228` تغییر دهید
- یا backend را روی 5001 اجرا کنید

## 5. جریان راه‌اندازی و Pipeline در `Program.cs`

ترتیب مهم اجرا:

1. خواندن ConnectionString و UploadPath
2. رجیستر کردن لایه‌های `AddApplication()` و `AddInfrastructure(...)`
3. Controllers + JSON options (camelCase + enum string)
4. SignalR با `MaximumReceiveMessageSize = 256KB`
5. RateLimiter Policyها:
   - `auth`: 5 درخواست/دقیقه/IP
   - `envelopes`: 60 درخواست/دقیقه/کاربر
   - `keys`: 30 درخواست/دقیقه/کاربر
   - `uploads`: 10 درخواست/دقیقه/کاربر
6. CORS policy با originهای `http://localhost:3000` و `http://localhost:4200`
7. اجرای migration + seeding
8. افزودن security headers (CSP, X-Frame-Options, Referrer-Policy, ...)
9. HTTPS + Routing + Cors + RateLimiter + Authentication + Authorization
10. سرو فایل‌های SPA از `ClientApp/dist`
11. سرو فایل‌های `Uploads`:
    - `/uploads/avatars`
    - `/uploads/voices`
    - `/uploads/attachments`
12. MapControllers + MapHub(`/chatHub`) + SPA fallback

## 6. مدل داده (Domain)

### موجودیت‌های چت

- `User`
- `Chat`
- `ChatParticipant`
- `Message`
- `Attachment`
- `VoiceNote`
- `Reaction`

### موجودیت‌های E2EE

- `DeviceRegistration`
- `IdentityKeyRecord`
- `SignedPreKeyRecord`
- `KyberPreKeyRecord`
- `OneTimePreKeyRecord`
- `MessageEnvelope`
- `EncryptedAttachment`

### Enumها

- `ChatType`: `Direct | Group | Channel | SavedMessages`
- `MessageStatus`: `Sending | Sent | Delivered | Seen`
- `AttachmentType`: `Image | Video | Audio | Document`
- `EnvelopeType`: `PreKeyMessage | NormalMessage | SenderKeyMessage`

## 7. دیتابیس و Migration

Migrationهای اصلی:

- `Initial` (ساخت جداول اصلی پیام‌رسان + Identity)
- `E2EE` (جداول کلیدها، دستگاه‌ها، envelope و attachment رمز‌شده)
- `ExpandAvatarUrl` (`DomainUsers.AvatarUrl` از `nvarchar(500)` به `nvarchar(max)`)

در `SeedData`:

- Migration خودکار اجرا می‌شود
- seed قدیمی چت‌های demo پاک می‌شود
- اگر `DomainUsers` خالی باشد، 8 کاربر نمونه ساخته می‌شوند
- یک Identity user نمونه ساخته می‌شود:
  - Email: `demo@telegram.com`
  - Password: `Demo@123`

## 8. Reference بک‌اند (Controllers + Routes)

## 8.1 Auth (`/api/auth`)

- `POST /register` ثبت‌نام
- `POST /login` ورود
- `POST /logout` خروج
- `GET /me` کاربر جاری

## 8.2 Chats (`/api/chats`)

- `GET /` لیست چت‌های کاربر
- `GET /saved` گرفتن/ساخت Saved Messages
- `GET /{id}` اطلاعات یک چت
- `POST /` ساخت چت
- `PUT /{id}/pin` پین/آنپین
- `GET /search?q=...` جستجو

## 8.3 Messages (`/api/chats/{chatId}/messages`)

- `GET /` لیست پیام‌ها (pagination با `before`)
- `POST /` ارسال پیام
- `DELETE /{id}` حذف پیام
- `POST /{id}/reactions` افزودن/تاگل واکنش
- `DELETE /{id}/reactions/{emoji}` حذف واکنش
- `POST /{id}/forward` فوروارد پیام

## 8.4 Users (`/api/users`)

- `GET /search?q=...` جستجوی کاربر
- `GET /{id}` دریافت کاربر
- `PUT /profile` بروزرسانی پروفایل

## 8.5 Files (`/api/files`)

- `POST /voice`
- `POST /avatar`
- `POST /attachment`

## 8.6 Devices (`/api/devices`)

- `POST /register`
- `GET /`
- `DELETE /{deviceId}`

## 8.7 Keys (`/api/keys`)

- `POST /bundle/{deviceId}` آپلود Key Bundle
- `GET /bundle/{userId}/{deviceId}` گرفتن bundle دستگاه خاص
- `GET /bundle/{userId}` گرفتن bundle همه دستگاه‌ها
- `POST /replenish/{deviceId}` شارژ مجدد one-time prekeys
- `GET /otpk-count/{deviceId}` تعداد prekey باقیمانده

## 8.8 Envelopes (`/api/envelopes`)

- `POST /` ارسال envelopeها
- `GET /{deviceId}` دریافت queue
- `POST /ack/{deviceId}` Ack و حذف envelopeهای دریافت‌شده

## 8.9 Attachments رمز‌شده (`/api/attachments`)

- `POST /upload` شروع upload
- `PUT /{attachmentId}/chunks/{chunkIndex}` آپلود chunk
- `POST /{attachmentId}/complete` نهایی‌سازی
- `GET /{attachmentId}` دانلود ciphertext

## 9. سرویس‌های Application و متدها

## 9.1 `ChatAppService`

- `GetUserChatsAsync(userId)`
- `GetChatByIdAsync(chatId, userId)`
- `CreateChatAsync(dto, creatorId)` (برای چت مستقیم، dedupe)
- `PinChatAsync(chatId, userId, isPinned)`
- `SearchChatsAsync(userId, query)`
- `GetOrCreateSavedMessagesAsync(userId)`

## 9.2 `MessageAppService`

- `GetMessagesAsync(chatId, limit, before)`
- `SendMessageAsync(chatId, senderId, dto)` (sanitize متن و attachment)
- `DeleteMessageAsync(messageId, userId)` (soft delete)
- `AddReactionAsync(messageId, userId, emoji)` (toggle)
- `RemoveReactionAsync(messageId, userId, emoji)`
- `ForwardMessageAsync(messageId, targetChatId, userId)`
- `UpdateMessageStatusAsync(messageId, status)`

## 9.3 `UserAppService`

- `GetUserByIdAsync(userId)`
- `UpdateProfileAsync(userId, dto)`
- `SearchUsersAsync(query)`
- `SetOnlineStatusAsync(userId, isOnline)`

## 9.4 `DeviceService`

- `RegisterDeviceAsync(userId, dto)`
- `GetUserDevicesAsync(userId)`
- `GetDeviceAsync(userId, deviceId)`
- `RevokeDeviceAsync(userId, deviceId)`
- `UpdateLastActiveAsync(userId, deviceId)`

## 9.5 `KeyBundleService`

- `UploadBundleAsync(userId, deviceId, dto)`
- `FetchBundleAsync(targetUserId, targetDeviceId)` (مصرف OTPK)
- `FetchAllDeviceBundlesAsync(targetUserId)`
- `ReplenishPreKeysAsync(userId, deviceId, dto)`
- `GetOneTimePreKeyCountAsync(userId, deviceId)`

## 9.6 `MessageEnvelopeService`

- `SubmitEnvelopesAsync(senderUserId, senderDeviceId, envelopes)`
- `FetchQueuedAsync(userId, deviceId, limit)`
- `AcknowledgeAsync(userId, deviceId, dto)`

## 9.7 `EncryptedAttachmentService`

- `InitiateUploadAsync(userId)`
- `UploadChunkAsync(attachmentId, userId, stream, chunkIndex)`
- `CompleteUploadAsync(attachmentId, userId)`
- `DownloadCiphertextAsync(attachmentId, userId)`

## 9.8 `AuthService`

- `RegisterAsync(dto)` (ایجاد DomainUser + IdentityUser + signin)
- `LoginAsync(dto)` (PasswordSignIn + online state)
- `LogoutAsync()`
- `GetCurrentUserAsync(identityUserId)`

## 10. Repository Layer و قراردادها

`Repository<T>` متدهای پایه را دارد:

- `GetByIdAsync`
- `GetAllAsync`
- `FindAsync`
- `AddAsync`
- `Update`
- `Remove`

Repositoryهای تخصصی:

- `ChatRepository`: `GetUserChatsAsync`, `GetDirectChatBetweenUsersAsync`, `GetSavedMessagesChatAsync`, `SearchChatsAsync`
- `MessageRepository`: `GetChatMessagesAsync`, `GetMessageWithDetailsAsync`, `GetUnreadCountAsync`
- `ReactionRepository`: `GetUserReactionAsync`, `GetMessageReactionsAsync`
- `DeviceRepository`: `GetUserDevicesAsync`, `GetDeviceAsync`, `GetNextDeviceIdAsync`
- `KeyBundleRepository`: مدیریت Identity/Signed/Kyber/OneTimePreKey + consume/remove
- `MessageEnvelopeRepository`: queue fetch + mark delivered + cleanup
- `EncryptedAttachmentRepository`: auth lookup + chunk progress + expired cleanup

## 11. SignalR Contract

Hub: `ChatHub` روی `/chatHub`

### Client -> Server

- `JoinChat(chatId)`
- `LeaveChat(chatId)`
- `StartTyping(chatId)`
- `StopTyping(chatId)`
- `MessageDelivered(chatId, messageId)`
- `MessageSeen(chatId, messageId)`
- `NotifyKeyChange(targetUserId)`

### Server -> Client

- `ReceiveMessage`
- `MessageDeleted`
- `ReactionUpdated`
- `UserTyping`
- `UserStoppedTyping`
- `UserOnline`
- `UserOffline`
- `MessageStatusChanged`
- `NewEnvelope` (در EnvelopesController)
- `KeyBundleChanged` (در ChatHub)

## 12. معماری فرانت‌اند (Angular)

### Routing

- `/auth/login` (guestGuard)
- `/auth/register` (guestGuard)
- `/` (ChatList + authGuard)
- `/chat/:id` (ChatRoom + authGuard)

### State اصلی

- `AuthService`: session/currentUser/isAuthenticated/isLoading
- `ChatService`: `chats`, `messages`, `typingUsers`
- `ThemeService`: `currentTheme`, `isDarkMode`
- `VoiceRecorderService`: `isRecording`, `recordingDuration`

## 13. سرویس‌های کلیدی فرانت و متدها

## 13.1 `ApiService`

لایه‌ی HTTP کامل برای تمام endpointهای Auth/Chat/Message/User/File/E2EE.

## 13.2 `AuthService`

- `initialize()`
- `login(email,password)`
- `register(email,password,name,username?)`
- `logout()`
- `updateProfile(data)`

## 13.3 `ChatService`

متدهای اصلی:

- لود اولیه: `loadChats()`, `ensureMessagesLoaded(chatId)`
- mapperها: `mapChat`, `mapMessage`, `mapUser`
- queryها: `getChatById`, `getMessagesForChat`, `getMessageById`
- mutationها: `addMessage`, `updateMessage`, `deleteMessage`, `addReaction`, `markAsRead`
- چت مستقیم: `startDirectChat(userId)`
- realtime helpers: `setupSignalRHandlers`, `setTyping`, `updateUserOnlineStatus`

## 13.4 `SignalRService`

- lifecycle: `start`, `stop`
- chat ops: `joinChat`, `leaveChat`
- typing/status: `startTyping`, `stopTyping`, `messageDelivered`, `messageSeen`
- subscription API: `onMessage`, `onReactionUpdated`, `onUserOnline`, ...

## 13.5 `VoiceRecorderService`

- `startRecording`
- `stopRecording` (extract duration + waveform)
- `cancelRecording`

## 13.6 `AttachmentCryptoService`

- `encryptAttachment`, `decryptAttachment`, `decryptAttachmentBlob`
- `encryptVoiceNote`
- `encryptThumbnail`, `decryptThumbnail`
- `verifyDigest`

## 13.7 `SignalProtocolService`

- `initializeIdentity(deviceId)`
- `processPreKeyBundle(bundle)`
- `encrypt(userId,deviceId,plaintext)`
- `decrypt(userId,deviceId,type,ciphertext)`
- `hasSession(userId,deviceId)`
- `computeSafetyNumber(...)`
- `generatePreKeys(startId,count)`

## 13.8 `E2eeMessageService`

- setup: `setup(userId)`
- send: `sendMessage`, `sendAttachment`, `sendVoiceNote`
- receive: `fetchAndDecrypt`, `decryptEnvelope`
- attachment decrypt: `downloadAndDecryptAttachment`, `downloadAndDecryptVoice`
- prekey maintenance: `checkAndReplenishPreKeys`
- saved messages: `initSavedMessages`, `sendSavedMessage`, `sendSavedAttachment`, `sendSavedVoiceNote`, `decryptSavedEnvelope`
- امنیت محلی: `lockKeyStore`, `wipeAll`, `lockSavedVault`

## 13.9 `SavedMessagesCryptoService`

- `initialize`, `reset`
- `encrypt`, `decrypt`
- chain ratchet: `deriveMessageKey`, `advanceChain`, `hkdfDerive`

## 13.10 `KeyStoreService`

- `initialize`, `unlock`, `isInitialized`, `lock`, `wipe`, `touch`
- identity/session/prekey/signedPrekey storage APIs
- message cache APIs
- saved-vault state & chain snapshot APIs

## 14. کامپوننت‌های اصلی UI

## 14.1 `ChatListComponent`

مسئول:

- نمایش لیست چت‌ها + pinned/saved
- جستجو
- پروفایل کاربر (edit name/username/bio/avatar)
- New Chat modal و جستجوی کاربر
- PWA banners (install/update)
- تغییر theme

متدهای کلیدی:

- `openChat`, `openProfileCard`, `saveProfile`
- `openNewChatModal`, `onUserSearchInput`, `selectUserForChat`
- `animateProfileCardIn`, `animateNewChatModalIn`

## 14.2 `ChatRoomComponent`

مسئول:

- نمایش پیام با date grouping
- ارسال متن/فایل/ویس
- reply, reaction, forward, delete
- attachment panel, emoji picker
- drag&drop upload
- swipe-to-reply
- context preview و peer profile overlay

متدهای کلیدی:

- `initiateSendMessage`, `uploadPendingAttachments`
- `startRecording`, `stopAndSendRecording`
- `addFilesToPending`, `shareCurrentLocation`
- `onContextMenu`, `onContextAction`, `onContextReaction`
- `openPeerProfile`, `closePeerProfileCard`
- `scrollToBottom`, `scrollToMessage`

## 15. امنیت و پایداری

نکات امنیتی اعمال‌شده:

- Identity cookie hardening (`HttpOnly`, `Secure`, `SameSite=Strict`)
- امنیت هدرها + CSP در middleware
- No-store cache روی `/api/*`
- Rate limiting policy-level
- server-side عضویت چت در `ChatHub` قبل از join/typing/status
- E2EE key segregation (کلید خصوصی فقط کلاینت)

## 16. وضعیت Build فعلی

روی همین workspace تست شده:

- `dotnet build TelegramClone.slnx` => موفق
- `npm run build` در `ClientApp` => موفق
- یک هشدار CommonJS برای `lottie-web` در Angular build وجود دارد

## 17. E2EE Contracts (canonical reference)

All behavior gaps documented in the earlier version of this section have been **resolved**.

### 17.1 SignalR Real-Time Events

| Event Name (canonical) | Direction | Payload | Trigger |
|---|---|---|---|
| `NewEnvelope` | Server → Client | `{ destinationDeviceId: number, timestamp: string }` | Server accepted an envelope addressed to this device |
| `KeyBundleChanged` | Server → Client | `{ userId: string, timestamp: string }` | A user's key bundle was updated; sessions should be refreshed |

Client handler registration (`signalr.service.ts`):

```ts
this.hubConnection.on('NewEnvelope', (data: { destinationDeviceId: number; timestamp: string }) => { ... });
this.hubConnection.on('KeyBundleChanged', (data: { userId: string; timestamp: string }) => { ... });
```

### 17.2 Envelope Submission — `POST /api/envelopes`

**Request body:**

```json
{
  "senderDeviceId": 1,
  "envelopes": [
    {
      "destinationUserId": "guid",
      "destinationDeviceId": 1,
      "type": 1,
      "content": "<base64>",
      "envelopeId": "client-generated-uuid"
    }
  ]
}
```

- `senderDeviceId` — must belong to the authenticated user (403 otherwise).
- `envelopeId` — client-generated UUID; server deduplicates on `(destinationDeviceId, envelopeId)`.
- `content` — base64, max 256 KB decoded.
- `type` — `1` = PreKey, `2` = Normal, `3` = SenderKey.

**Response:**

```json
{
  "submitted": 1,
  "results": [
    { "index": 0, "status": "accepted" }
  ]
}
```

Per-item `status` values: `accepted`, `duplicate`, `rejected`.

### 17.3 OTPK Count — `GET /api/keys/otpk-count/{deviceId}`

```json
{ "available": 42 }
```

Canonical field name is **`available`** (not `count`).

### 17.4 Key Bundle Fetch — `GET /api/keys/bundle/{userId}/{deviceId}`

```json
{
  "userId": "guid",
  "deviceId": 1,
  "registrationId": 12345,
  "identityPublicKey": "<base64>",
  "signedPreKey": { "keyId": 1, "publicKey": "<base64>", "signature": "<base64>" },
  "kyberPreKey": null,
  "oneTimePreKey": { "keyId": 5, "publicKey": "<base64>", "signature": null }
}
```

- `oneTimePreKey` is `null` when all OTPKs are consumed.
- OTPK consumption is atomic (SQL Server: `UPDLOCK, ROWLOCK, READPAST`; wrapped in explicit transaction).

### 17.5 Device Ownership Enforcement

All envelope and key endpoints that accept a `deviceId` parameter validate that the device belongs to the authenticated user. Requests with a mismatched device return **403**:

| Endpoint | Parameter |
|---|---|
| `POST /api/envelopes` | `senderDeviceId` in body |
| `GET /api/envelopes/{deviceId}` | path |
| `POST /api/envelopes/ack/{deviceId}` | path |
| `POST /api/keys/bundle/{deviceId}` | path |
| `POST /api/keys/replenish/{deviceId}` | path |
| `GET /api/keys/otpk-count/{deviceId}` | path |

### 17.6 Rate Limiting Policies

| Policy | Limit | Scope | Applied To |
|---|---|---|---|
| `auth` | 5/min | per IP | `AuthController` |
| `envelopes` | 60/min | per user | `EnvelopesController` |
| `keys` | 30/min | per user | `KeysController` |
| `uploads` | 10/min | per user | `AttachmentsController` |

### 17.7 Envelope Queue Limits & Cleanup

- Per-device queue limit: **1 000** undelivered envelopes.
- Expired envelopes (>30 days) cleaned up hourly by `EnvelopeCleanupService`.

### 17.8 Attachment Digest Verification

Client-side: `verifyDigest()` is called **before** decryption in `downloadAndDecryptAttachment` / `downloadAndDecryptVoice`. If the SHA-256 digest doesn't match, decryption is skipped and an error is thrown.

## 18. فایل‌های مهم برای شروع مطالعه

- `src/TelegramClone.Web/Program.cs`
- `src/TelegramClone.Infrastructure/Data/TelegramDbContext.cs`
- `src/TelegramClone.Application/Services/*.cs`
- `src/TelegramClone.Web/Controllers/Api/*.cs`
- `src/TelegramClone.Web/Hubs/ChatHub.cs`
- `src/TelegramClone.Web/ClientApp/src/core/services/chat.service.ts`
- `src/TelegramClone.Web/ClientApp/src/features/chat-room/chat-room.component.ts`
- `src/TelegramClone.Web/ClientApp/src/core/services/e2ee-message.service.ts`

