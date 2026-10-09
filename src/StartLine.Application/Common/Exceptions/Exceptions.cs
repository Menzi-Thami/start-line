namespace StartLine.Application.Common.Exceptions;

#pragma warning disable CA1032 // These carry required data; the parameterless constructors would let them be thrown empty.
public sealed class NotFoundException(string resource, string key)
    : Exception($"{resource} '{key}' was not found.");

public sealed class ValidationException(IReadOnlyDictionary<string, string[]> errors)
    : Exception("One or more validation errors occurred.")
{
    public IReadOnlyDictionary<string, string[]> Errors { get; } = errors;
}

/// <summary>The caller is signed in but may not do this yet. <see cref="Code"/> tells the client what to fix.</summary>
public sealed class ForbiddenException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}

/// <summary>The request clashes with current state, such as a limit already reached.</summary>
public sealed class ConflictException(string code, string message) : Exception(message)
{
    public string Code { get; } = code;
}
#pragma warning restore CA1032
