using FluentValidation;
using StartLine.Application.Common;
using StartLine.Application.Common.Dispatcher;
using StartLine.Domain.Running;

namespace StartLine.Application.Features.Predictions;

public sealed record PredictRaceTimeQuery(double FromKm, TimeSpan Time, double ToKm) : IRequest<PredictionDto>;

public sealed record PredictionDto(double DistanceKm, TimeSpan PredictedTime, double PaceSecondsPerKm);

internal sealed class PredictRaceTimeValidator : AbstractValidator<PredictRaceTimeQuery>
{
    public PredictRaceTimeValidator()
    {
        RuleFor(q => q.FromKm).GreaterThan(0).LessThanOrEqualTo(Distance.MaxKilometres);
        RuleFor(q => q.ToKm).GreaterThan(0).LessThanOrEqualTo(Distance.MaxKilometres);
        RuleFor(q => q.Time)
            .Must((q, time) => GoalTimeRules.IsPlausible(q.FromKm, time))
            .WithMessage(GoalTimeRules.Message);
    }
}

internal sealed class PredictRaceTimeHandler : IRequestHandler<PredictRaceTimeQuery, PredictionDto>
{
    public Task<PredictionDto> Handle(PredictRaceTimeQuery request, CancellationToken cancellationToken)
    {
        var to = Distance.FromKilometres(request.ToKm);
        var predicted = RaceTimePredictor.Predict(Distance.FromKilometres(request.FromKm), request.Time, to);
        var rounded = TimeSpan.FromSeconds(Math.Round(predicted.TotalSeconds));
        return Task.FromResult(new PredictionDto(request.ToKm, rounded, Pace.Of(to, rounded).SecondsPerKilometre));
    }
}
