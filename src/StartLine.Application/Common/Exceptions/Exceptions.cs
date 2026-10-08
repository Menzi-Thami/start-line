namespace StartLine.Application.Common.Exceptions;

#pragma warning disable CA1032 // These carry required data; the parameterless constructors would let them be thrown empty.
public sealed class NotFoundException(string resource, string key)
    : Exception($"{resource} '{key}' was not found.");

public sealed class ValidationException(IReadOnlyDictionary<string, string[]> errors)
    : Exception("One or more validation errors occurred.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}
#pragma warning restore CA1032
