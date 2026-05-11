using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using azadiyanChat.Application.Interfaces;
using azadiyanChat.Application.Mapping;
using azadiyanChat.Application.Services;

namespace azadiyanChat.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddAutoMapper(typeof(MappingProfile));
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);

        // Existing services
        services.AddScoped<IChatAppService, ChatAppService>();
        services.AddScoped<IMessageAppService, MessageAppService>();
        services.AddScoped<IUserAppService, UserAppService>();

        // E2EE services
        services.AddScoped<IDeviceService, DeviceService>();
        services.AddScoped<IKeyBundleService, KeyBundleService>();
        services.AddScoped<IMessageEnvelopeService, MessageEnvelopeService>();

        return services;
    }
}
