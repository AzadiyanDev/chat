using azadiyanChat.Application;
using azadiyanChat.Infrastructure;
using azadiyanChat.Infrastructure.Data;
using azadiyanChat.Web.Hubs;
using azadiyanChat.Web.Services;
using Microsoft.AspNetCore.StaticFiles;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = ResolveContentRootPath()
});

// ──── Clean Architecture Layers ────
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
    ?? "Server=(localdb)\\mssqllocaldb;Database=azadiyanChat;Trusted_Connection=True;MultipleActiveResultSets=true";

var webRootPath = builder.Environment.WebRootPath;
if (string.IsNullOrWhiteSpace(webRootPath))
{
    webRootPath = Path.Combine(builder.Environment.ContentRootPath, "wwwroot");
}

if (!Directory.Exists(webRootPath))
{
    Directory.CreateDirectory(webRootPath);
}

var uploadPath = Path.Combine(webRootPath, "uploads");

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

// ──── Background Services ────
builder.Services.AddHostedService<EnvelopeCleanupService>();

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
var staticContentTypeProvider = new FileExtensionContentTypeProvider();
staticContentTypeProvider.Mappings[".woff2"] = "font/woff2";
staticContentTypeProvider.Mappings[".woff"] = "font/woff";
staticContentTypeProvider.Mappings[".ttf"] = "font/ttf";
staticContentTypeProvider.Mappings[".otf"] = "font/otf";
staticContentTypeProvider.Mappings[".eot"] = "application/vnd.ms-fontobject";
staticContentTypeProvider.Mappings[".svg"] = "image/svg+xml";
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spaFileProvider });
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = spaFileProvider,
    RequestPath = "",
    ContentTypeProvider = staticContentTypeProvider,
    OnPrepareResponse = ctx =>
    {
        var path = ctx.Context.Request.Path.Value ?? string.Empty;
        if (path.Equals("/index.html", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("/ngsw.json", StringComparison.OrdinalIgnoreCase) ||
            path.Equals("/release-manifest.json", StringComparison.OrdinalIgnoreCase))
        {
            // Keep SPA shell and update manifest always fresh so new deploys are detected fast.
            ctx.Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
            ctx.Context.Response.Headers["Pragma"] = "no-cache";
            ctx.Context.Response.Headers["Expires"] = "0";
        }
    }
});

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = staticContentTypeProvider
}); // wwwroot

// ──── Upload files ────
// Encrypted attachments are served through /api/attachments/{id} (authenticated).
// Legacy uploads path is also used by chat attachments/voice messages in this client.
var uploadsPath = uploadPath;
if (!Directory.Exists(uploadsPath)) Directory.CreateDirectory(uploadsPath);

var avatarsPath = Path.Combine(uploadsPath, "avatars");
if (!Directory.Exists(avatarsPath)) Directory.CreateDirectory(avatarsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(avatarsPath),
    RequestPath = "/uploads/avatars",
    ContentTypeProvider = staticContentTypeProvider,
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
    RequestPath = "/uploads/voices",
    ContentTypeProvider = staticContentTypeProvider
});

var attachmentsPath = Path.Combine(uploadsPath, "attachments");
if (!Directory.Exists(attachmentsPath)) Directory.CreateDirectory(attachmentsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(attachmentsPath),
    RequestPath = "/uploads/attachments",
    ContentTypeProvider = staticContentTypeProvider,
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

static string ResolveContentRootPath()
{
    var currentDirectory = Directory.GetCurrentDirectory();
    var baseDirectory = AppContext.BaseDirectory;

    var currentHasConfig = File.Exists(Path.Combine(currentDirectory, "appsettings.json"));
    var currentHasClientDist = Directory.Exists(Path.Combine(currentDirectory, "ClientApp", "dist"));
    if (currentHasConfig && currentHasClientDist)
        return currentDirectory;

    var baseHasConfig = File.Exists(Path.Combine(baseDirectory, "appsettings.json"));
    var baseHasClientDist = Directory.Exists(Path.Combine(baseDirectory, "ClientApp", "dist"));
    if (baseHasConfig && baseHasClientDist)
        return baseDirectory;

    // Fallback to current directory in edge cases (tests/custom hosts).
    return currentDirectory;
}

// Marker class for WebApplicationFactory<Program> in integration tests
public partial class Program { }
