using TelegramClone.Application;
using TelegramClone.Infrastructure;
using TelegramClone.Infrastructure.Data;
using TelegramClone.Web.Hubs;

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
builder.Services.AddSignalR();

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
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseCors("Angular");

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
var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "Uploads");
if (!Directory.Exists(uploadsPath)) Directory.CreateDirectory(uploadsPath);
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
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
