using LiveEcgChart.Data;
using LiveEcgChart.Hubs;
using LiveEcgChart.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();
builder.Services.AddSignalR();
builder.Services.AddServerSideBlazor();
builder.Services.AddSingleton<WeatherForecastService>();
//builder.Services.AddSingleton<EcgFileManager>();
builder.Services.AddScoped<EcgFileManager>();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseRouting();

app.MapBlazorHub();
app.MapHub<EcgHub>("/ecgHub");
app.MapFallbackToPage("/_Host");

app.UseEndpoints(endpoints =>
{
    endpoints.MapGet("/EcgData/{fileName}", async context =>
    {
        var filePath = Path.Combine("wwwroot", "EcgData", context.Request.RouteValues["fileName"]?.ToString() ?? string.Empty);
        if (File.Exists(filePath))
        {
            context.Response.ContentType = "application/octet-stream";
            await context.Response.SendFileAsync(filePath);
        }
        else
        {
            context.Response.StatusCode = 404;
        }
    });
});


app.Run();
