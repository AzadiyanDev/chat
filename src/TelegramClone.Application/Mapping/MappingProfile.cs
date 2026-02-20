using AutoMapper;
using TelegramClone.Application.DTOs;
using TelegramClone.Domain.Entities;

namespace TelegramClone.Application.Mapping;

public class MappingProfile : Profile
{
    public MappingProfile()
    {
        // User
        CreateMap<User, UserDto>();
        CreateMap<UpdateProfileDto, User>()
            .ForAllMembers(opts => opts.Condition((src, dest, srcMember) => srcMember != null));

        // Chat
        CreateMap<Chat, ChatDto>()
            .ForMember(d => d.Participants, opt => opt.MapFrom(s => s.Participants.Select(p => p.User)))
            .ForMember(d => d.MemberCount, opt => opt.MapFrom(s => s.Participants.Count))
            .ForMember(d => d.LastMessage, opt => opt.MapFrom(s =>
                s.Messages.OrderByDescending(m => m.Timestamp).FirstOrDefault()));

        CreateMap<Chat, ChatListItemDto>()
            .ForMember(d => d.Name, opt => opt.MapFrom(s => s.Name ?? string.Empty))
            .ForMember(d => d.Participants, opt => opt.MapFrom(s => s.Participants.Select(p => p.User)))
            .ForMember(d => d.LastMessage, opt => opt.MapFrom(s =>
                s.Messages.Where(m => !m.IsDeleted).OrderByDescending(m => m.Timestamp).FirstOrDefault()));

        // Message
        CreateMap<Message, MessageDto>()
            .ForMember(d => d.SenderName, opt => opt.MapFrom(s => s.Sender.Name))
            .ForMember(d => d.SenderAvatarUrl, opt => opt.MapFrom(s => s.Sender.AvatarUrl))
            .ForMember(d => d.Voice, opt => opt.MapFrom(s => s.VoiceNote))
            .ForMember(d => d.Reactions, opt => opt.MapFrom(s =>
                s.Reactions.GroupBy(r => r.Emoji).Select(g => new ReactionGroupDto
                {
                    Emoji = g.Key,
                    UserIds = g.Select(r => r.UserId).ToList()
                })));

        // Attachment
        CreateMap<Attachment, AttachmentDto>();

        // VoiceNote
        CreateMap<VoiceNote, VoiceNoteDto>()
            .ForMember(d => d.Waveform, opt => opt.MapFrom(s => s.GetWaveform()));
    }
}
