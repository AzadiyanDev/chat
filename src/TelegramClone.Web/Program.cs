using TelegramClone.Application;
using TelegramClone.Infrastructure;
using TelegramClone.Infrastructure.Data;
using TelegramClone.Web.Hubs;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// ──── Clean Architecture Layers ────
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=(localdb)\\mssqllocaldb;Database=TelegramClone;Trusted_Connection=True;MultipleActiveResultSets=true";

var uploadPath = Path.Combine(builder.Environment.ContentRootPath, "Uploads");

builder.Services.AddApplication();
builder.Services.AddInfrastructure(connectionString, uploadPath);

// ──── API Controllers ────
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });

// ──── SignalR ────
builder.Services.AddSignalR(options =>
{
    options.MaximumReceiveMessageSize = 256 * 1024; // 256KB max SignalR message
});

// ──── Rate Limiting ────
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;

    // Auth endpoints: 5 requests per minute per IP
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1)
            }));

    // Envelope submission: 60 per minute per user
    options.AddPolicy("envelopes", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User?.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 60,
                Window = TimeSpan.FromMinutes(1)
            }));

    // Key bundle fetch: 30 per minute per user
    options.AddPolicy("keys", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User?.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1)
            }));

    // Attachment upload: 10 per minute per user
    options.AddPolicy("uploads", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User?.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1)
            }));
});

// ──── CORS (dev mode Angular on different port) ────
builder.Services.AddCors(options =>
{
    options.AddPolicy("Angular", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:4200")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

// ──── Ensure Database Created ────
await SeedData.InitializeAsync(app.Services);

// ──── Middleware Pipeline ────

// Security headers — applied to ALL responses
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;

    // CSP: no eval, no third-party scripts, inline styles allowed (Angular/GSAP need them)
    headers.Append("Content-Security-Policy",
        "default-src 'none'; " +
        "script-src 'self' 'wasm-unsafe-eval'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' blob: data:; " +
        "media-src 'self' blob:; " +
        "connect-src 'self' wss://localhost:* ws://localhost:*; " +
        "font-src 'self'; " +
        "manifest-src 'self'; " +
        "worker-src 'self' blob:; " +
        "frame-src 'none'; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none'; " +
        "upgrade-insecure-requests");

    headers.Append("X-Content-Type-Options", "nosniff");
    headers.Append("X-Frame-Options", "DENY");
    headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.Append("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=()");
    headers.Append("Cross-Origin-Opener-Policy", "same-origin");
    headers.Append("Cross-Origin-Resource-Policy", "same-origin");
    headers.Append("X-DNS-Prefetch-Control", "off");

    // For API responses: prevent caching of sensitive data
    if (context.Request.Path.StartsWithSegments("/api"))
    {
        headers.Append("Cache-Control", "no-store");
        headers.Append("Pragma", "no-cache");
    }

    await next();
});

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Angular");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

// Serve Angular static files from ClientApp/dist
var clientAppDist = Path.Combine(builder.Environment.ContentRootPath, "ClientApp", "dist");
if (!Directory.Exists(clientAppDist)) Directory.CreateDirectory(clientAppDist);

var spaFileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(clientAppDist);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spaFileProvider });
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = spaFileProvider,
    RequestPath = ""
});

app.UseStaticFiles(); // wwwroot

// ──── Upload files ────
// Encrypted attachments are served through /api/attachments/{id} (authenticated).
// Legacy uploads path is also used by chat attachments/voice messages in this client.
var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "Uploads");
if (!Directory.Exists(uploadsPath)) Directory.CreateDirectory(uploadsPath);

var avatarsPath = Path.Combine(uploadsPath, "avatars");
if (!Directory.Exists(avatarsPath)) Directory.CreateDirectory(avatarsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(avatarsPath),
    RequestPath = "/uploads/avatars",
    OnPrepareResponse = ctx =>
    {
        // Cache avatars but no other uploads
        ctx.Context.Response.Headers.Append("Cache-Control", "public, max-age=86400");
    }
});

var voicesPath = Path.Combine(uploadsPath, "voices");
if (!Directory.Exists(voicesPath)) Directory.CreateDirectory(voicesPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(voicesPath),
    RequestPath = "/uploads/voices"
});

var attachmentsPath = Path.Combine(uploadsPath, "attachments");
if (!Directory.Exists(attachmentsPath)) Directory.CreateDirectory(attachmentsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(attachmentsPath),
    RequestPath = "/uploads/attachments",
    ServeUnknownFileTypes = true,
    DefaultContentType = "application/octet-stream"
});

// ──── Endpoints ────
app.MapControllers();

app.MapHub<ChatHub>("/chatHub");

// SPA fallback: serve index.html for non-API, non-file routes
app.MapFallback(async context =>
{
    var indexPath = Path.Combine(clientAppDist, "index.html");
    if (File.Exists(indexPath))
    {
        context.Response.ContentType = "text/html";
        await context.Response.SendFileAsync(indexPath);
    }
    else
    {
        context.Response.StatusCode = 404;
    }
});

app.Run();
