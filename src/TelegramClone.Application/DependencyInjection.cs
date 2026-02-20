using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using TelegramClone.Application.Interfaces;
using TelegramClone.Application.Mapping;
using TelegramClone.Application.Services;

namespace TelegramClone.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddAutoMapper(typeof(MappingProfile));
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);

        services.AddScoped<IChatAppService, ChatAppService>();
        services.AddScoped<IMessageAppService, MessageAppService>();
        services.AddScoped<IUserAppService, UserAppService>();

        return services;
    }
}
