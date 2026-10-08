using NSubstitute;
using StartLine.Application.Features.Races;
using StartLine.Domain.Races;
using StartLine.Domain.Running;

namespace StartLine.Application.Tests;

internal static class TestRaces
{
    public static readonly DateTimeOffset Now = new(2026, 10, 8, 9, 0, 0, TimeSpan.Zero);

    public static readonly Race Comrades = new("comrades-2027", "Comrades Marathon", new DateOnly(2027, 6, 13),
        Distance.FromKilometres(90), "Pietermaritzburg to Durban", "Down run.", null);

    public static readonly Race NextWeekend = new("next-weekend-10k", "Next Weekend 10K", new DateOnly(2026, 10, 17),
        Distance.TenK, "Durban", "Too soon for a plan.", null);

    public static readonly Race LastMonth = new("last-month-half", "Last Month Half", new DateOnly(2026, 9, 6),
        Distance.HalfMarathon, "Johannesburg", "Already run.", null);

    public static IRaceCatalogue Catalogue()
    {
        var catalogue = Substitute.For<IRaceCatalogue>();
        Race[] all = [Comrades, LastMonth, NextWeekend];
        catalogue.All().Returns(all);
        catalogue.FindBySlug(Arg.Any<string>()).Returns(call =>
            all.FirstOrDefault(r => string.Equals(r.Slug, call.Arg<string>(), StringComparison.OrdinalIgnoreCase)));
        return catalogue;
    }
}
