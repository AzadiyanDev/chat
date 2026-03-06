# TelegramClone (AzadiyanChat)

یک پیام‌رسان Full-Stack با معماری چندلایه (Clean-ish Architecture) روی .NET و Angular، با دو مسیر امنیتی برای پیام:

1. مسیر عادی چت (`/api/chats/...`) با **رمزنگاری متن پیام در دیتابیس** (At-Rest Encryption)
2. مسیر E2EE (`/api/envelopes`) با **Signal Protocol** برای ارتباط دستگاه‌به‌دستگاه

این README برای استفاده مستقیم در ریپازیتوری گیت نوشته شده و سعی کرده هم معماری پروژه را کامل توضیح بدهد و هم مسیر امنیت/رمزنگاری پیام را شفاف کند.

---

## فهرست مطالب

1. [معرفی پروژه](#معرفی-پروژه)
2. [ویژگی‌ها](#ویژگیها)
3. [معماری کلی](#معماری-کلی)
4. [استک تکنولوژی](#استک-تکنولوژی)
5. [مدل‌های رمزنگاری در پروژه](#مدلهای-رمزنگاری-در-پروژه)
6. [روند کامل متن تا گیرنده](#روند-کامل-متن-تا-گیرنده)
7. [مثال‌های عملی](#مثالهای-عملی)
8. [نصب و اجرا](#نصب-و-اجرا)
9. [تنظیمات امنیتی مهم](#تنظیمات-امنیتی-مهم)
10. [API خلاصه](#api-خلاصه)
11. [تست‌ها](#تستها)
12. [ساختار پوشه‌ها](#ساختار-پوشهها)
13. [نکات امنیتی و محدودیت‌ها](#نکات-امنیتی-و-محدودیتها)

---

## معرفی پروژه

`TelegramClone` (AzadiyanChat) یک نمونه جدی از پیام‌رسان مدرن است که این موارد را پوشش می‌دهد:

- چت خصوصی/گروهی
- ارسال پیام متنی، فایل، ویس، ری‌اکشن، فوروارد
- Real-time با SignalR
- مدیریت چند دستگاه (Multi-Device)
- زیرساخت E2EE مبتنی بر Bundle/Envelope
- ذخیره‌سازی امن‌تر پیام در دیتابیس با کلیدهای مشتق‌شده‌ی پویا

---

## ویژگی‌ها

- Backend: ASP.NET Core + EF Core + Identity
- Frontend: Angular Standalone + SignalR client + PWA
- Rate limiting برای Auth / Envelopes / Keys / Uploads
- Security headers و hardening برای cookie/session
- رمزنگاری chunk-based برای متن پیام در دیتابیس
- E2EE پیام‌ها با Signal Protocol در مسیر envelopes
- رمزنگاری فایل/ویس با `libsodium secretstream`

---

## معماری کلی

لایه‌ها:

- `TelegramClone.Domain`: موجودیت‌ها، enumها، قراردادهای repository
- `TelegramClone.Application`: use-caseها، DTOها، سرویس‌های اپلیکیشن
- `TelegramClone.Infrastructure`: EF/Identity/Repository/Services
- `TelegramClone.Web`: API + SignalR + Hosting + middleware
- `ClientApp`: رابط کاربری Angular

وابستگی‌ها:

- `Web -> Application + Infrastructure`
- `Infrastructure -> Application + Domain`
- `Application -> Domain`
- `Domain` مستقل

---

## استک تکنولوژی

### Backend

- .NET 10
- ASP.NET Core Web API
- Entity Framework Core 10 (SQL Server)
- ASP.NET Core Identity
- SignalR

### Frontend

- Angular 21
- RxJS
- `@microsoft/signalr`
- `@privacyresearch/libsignal-protocol-typescript`
- `libsodium-wrappers-sumo`
- `argon2-browser`

---

## مدل‌های رمزنگاری در پروژه

این پروژه چند مدل امنیتی/رمزنگاری دارد. خیلی مهم است که مسیرها را با هم قاطی نکنیم.

### 1) رمزنگاری متن پیام در دیتابیس (At-Rest, Server-Side)

**مسیر:** `POST /api/chats/{chatId}/messages`

- متن قبل از ذخیره شدن در DB به chunk تبدیل می‌شود.
- هر chunk با AES-GCM رمز می‌شود.
- کلیدها استاتیک برای همه پیام‌ها نیستند و به صورت سلسله‌ای مشتق می‌شوند:

```text
masterKey
  -> chatKey(chatId)
    -> messageKey(messageId)
      -> chunkKey(chunkIndex)
```

فرمت payload هر chunk:

```text
[1-byte version][12-byte nonce][16-byte tag][ciphertext...]
```

نسخه فعلی: `v2`

AAD برای هر chunk شامل این مقادیر است:

- `chatId`
- `messageId`
- `chunkIndex`

پس اگر payload یک chunk جابجا یا دستکاری شود، decrypt fail می‌شود.

### 2) E2EE واقعی برای Envelopeها (Device-to-Device)

**مسیر:** `/api/envelopes`, `/api/keys`, `/api/devices`

- کلاینت با Signal Protocol (X3DH + Double Ratchet) پیام را روی دستگاه رمز می‌کند.
- سرور فقط ciphertext را صف می‌کند و decrypt نمی‌کند.
- دریافت‌کننده ciphertext را با کلیدهای محلی decrypt می‌کند.

### 3) E2EE فایل/ویس

- فایل/ویس روی کلاینت با `libsodium secretstream_xchacha20poly1305` به chunkهای رمز شده تبدیل می‌شود.
- سرور فقط chunkهای ciphertext را نگه می‌دارد.
- متادیتای decrypt (key/header/digest) داخل envelope رمز شده منتقل می‌شود.

### 4) Saved Messages Vault

- برای Saved Messages از کلید vault محلی + HKDF chain ratchet استفاده شده.
- رمزنگاری پیام: AES-256-GCM با AAD.
- state کلیدها در KeyStore رمز شده روی کلاینت نگه‌داری می‌شود.

---

## روند کامل متن تا گیرنده

### سناریو A: پیام عادی چت (`/api/chats/...`)

1. فرستنده متن را در UI می‌نویسد.
2. کلاینت درخواست `POST /api/chats/{chatId}/messages` می‌زند.
3. سرور عضویت کاربر در چت را چک می‌کند.
4. `MessageAppService` متن را chunk می‌کند.
5. `MessageTextProtectionService` با کلیدهای مشتق‌شده‌ی per-chat/per-message/per-chunk رمز می‌کند.
6. در DB، `Messages.Text = null` و فقط `MessageTextChunks.Payload` ذخیره می‌شود.
7. سرور برای response و broadcast، متن را decrypt می‌کند و از SignalR رویداد `ReceiveMessage` می‌فرستد.
8. گیرنده پیام را Real-time می‌بیند.
9. برای تاریخچه هم سرور chunkها را decrypt و برمی‌گرداند.

### سناریو B: پیام E2EE (`/api/envelopes`)

1. کلاینت فرستنده برای هر دستگاه مقصد session می‌سازد/بازیابی می‌کند.
2. plaintext با Signal Protocol روی کلاینت encrypt می‌شود.
3. envelopeهای ciphertext به سرور submit می‌شوند.
4. سرور envelopeها را بدون decrypt در queue ذخیره می‌کند.
5. سرور رویداد `NewEnvelope` می‌فرستد.
6. گیرنده queue را fetch می‌کند، روی کلاینت decrypt می‌کند و ack می‌دهد.

### سناریو C: فایل/ویس E2EE

1. فایل/ویس روی کلاینت chunk و رمز می‌شود.
2. chunkهای ciphertext روی `/api/attachments/...` آپلود می‌شوند.
3. pointer رمزگشایی (contentKey, streamHeader, digest, ...) داخل envelope رمز شده ارسال می‌شود.
4. گیرنده blob رمز شده را دانلود می‌کند.
5. digest بررسی می‌شود؛ بعد decrypt انجام می‌شود.

---

## مثال‌های عملی

### مثال 1: پیام متنی عادی

ورودی:

```text
"سلام دنیا"
```

روند:

1. سرور `messageId` را دارد (GUID)
2. متن UTF-8 شده و طبق `ChunkSizeBytes` تکه می‌شود
3. برای chunk شماره `i`:

```text
chatKey    = HMAC-SHA256(masterKey,  "tc-chat-key-v1"    || chatId)
messageKey = HMAC-SHA256(chatKey,    "tc-message-key-v1" || messageId)
chunkKey   = HMAC-SHA256(messageKey, "tc-chunk-key-v1"   || i)
nonce      = random(12)
aad        = chatId || messageId || i
cipher     = AES-GCM-Encrypt(chunkKey, nonce, plaintextChunk, aad)
payload    = version(2) || nonce || tag || cipher
```

خروجی DB:

- جدول `Messages`: متن plaintext ندارد (`Text = null`)
- جدول `MessageTextChunks`: payload رمز شده هر chunk

### مثال 2: اگر chunk دستکاری شود

- اگر `chatId`، `messageId` یا `chunkIndex` اشتباه شود، tag معتبر نیست.
- decrypt با خطای cryptographic fail می‌شود.

### مثال 3: envelope E2EE

نمونه payload submit:

```json
{
  "senderDeviceId": 1,
  "envelopes": [
    {
      "destinationUserId": "11111111-1111-1111-1111-111111111111",
      "destinationDeviceId": 2,
      "type": 1,
      "content": "BASE64_CIPHERTEXT",
      "envelopeId": "22222222-2222-2222-2222-222222222222"
    }
  ]
}
```

سرور فقط:

- اعتبارسنجی هویت و اندازه
- dedup بر اساس `(destinationDeviceId, envelopeId)`
- queue + notification

---

## نصب و اجرا

### پیش‌نیاز

- .NET SDK 10
- Node.js 22+
- SQL Server یا LocalDB

### اجرای Backend

```bash
dotnet build TelegramClone.slnx
dotnet run --project src/TelegramClone.Web
```

### اجرای Frontend

```bash
cd src/TelegramClone.Web/ClientApp
npm install
npm run start
```

پورت‌های رایج:

- API: `https://localhost:7228` (بر اساس launch profile)
- Angular: `http://localhost:4200`

---

## تنظیمات امنیتی مهم

در `src/TelegramClone.Web/appsettings.json`:

```json
"MessageTextProtection": {
  "MasterKey": "",
  "ChunkSizeBytes": 512
}
```

### تولید MasterKey امن (PowerShell)

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

نکته‌ها:

1. در Production حتما `MasterKey` تنظیم شود.
2. طول کلید بعد از decode باید دقیقا 32 بایت باشد.
3. `ChunkSizeBytes` بزرگ‌تر یعنی throughput بهتر، کوچک‌تر یعنی granular بودن بیشتر.

---

## API خلاصه

### مسیر عادی چت

- `POST /api/chats/{chatId}/messages`
- `GET /api/chats/{chatId}/messages`
- `PUT /api/chats/{chatId}/messages/{id}`
- `DELETE /api/chats/{chatId}/messages/{id}`

### E2EE

- `POST /api/devices/register`
- `POST /api/keys/bundle/{deviceId}`
- `GET /api/keys/bundle/{userId}/{deviceId}`
- `POST /api/envelopes`
- `GET /api/envelopes/{deviceId}`
- `POST /api/envelopes/ack/{deviceId}`

### Attachments

- `POST /api/attachments/upload`
- `PUT /api/attachments/{attachmentId}/chunks/{chunkIndex}`
- `POST /api/attachments/{attachmentId}/complete`
- `GET /api/attachments/{attachmentId}`

---

## تست‌ها

اجرای تست‌های integration:

```bash
dotnet test tests/TelegramClone.IntegrationTests/TelegramClone.IntegrationTests.csproj
```

تست مربوط به رمزنگاری متن در دیتابیس:

- ذخیره نشدن plaintext
- امکان decrypt صحیح با context درست
- fail شدن decrypt با context اشتباه (chat/message/chunk)

---

## ساختار پوشه‌ها

```text
src/
  TelegramClone.Domain/
  TelegramClone.Application/
  TelegramClone.Infrastructure/
  TelegramClone.Web/
    ClientApp/
tests/
  TelegramClone.IntegrationTests/
```

---

## نکات امنیتی و محدودیت‌ها

این جدول خیلی مهم است:

| مسیر | سرور plaintext را می‌بیند؟ | رمزنگاری در دیتابیس | E2EE واقعی |
|---|---:|---:|---:|
| `/api/chats/...` | بله | بله | خیر |
| `/api/envelopes` | خیر | سرور فقط ciphertext دارد | بله |

پس:

1. اگر «سرور نباید متن را ببیند» هدف اصلی است، باید مسیر E2EE (`envelopes`) معیار شما باشد.
2. مسیر عادی چت الان از نظر At-Rest خیلی امن‌تر شده (کلید پویا per chat/message/chunk)، ولی ماهیتا E2EE نیست.
3. فرمت رمزنگاری متن پیام اکنون `v2` است.
4. در وضعیت فعلی پروژه، پیام‌های قدیمیِ v1 به‌صورت پیش‌فرض decrypt نمی‌شوند (اگر migration/backward لازم باشد باید جداگانه اضافه شود).

---

## جمع‌بندی

این پروژه هم برای محصول پیام‌رسان real-time مناسب است، هم برای مطالعه امنیت کاربردی:

- امنیت دیتابیس پیام‌ها با key derivation سلسله‌ای
- کانال E2EE چنددستگاهی با Signal Protocol
- رمزنگاری فایل/ویس با stream encryption
- زیرساخت تست‌پذیر، قابل توسعه، و آماده ارتقای بیشتر

اگر بخواهی، در قدم بعدی می‌توانم یک نسخه انگلیسی حرفه‌ای همین README هم کنار این نسخه اضافه کنم (مثلا `README.en.md`) تا برای مخاطب بین‌المللی هم آماده باشد.
