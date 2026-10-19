using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace StartLine.API.Infrastructure;

/// <summary>
/// Keeps enum schemas non-null. An enum schema is shared by every property that uses it, and whichever property the
/// generator meets first decides its shape, so one nullable use (a run with no planned zone) would make the enum
/// nullable everywhere. Nullability belongs on the property; the property already says so.
/// </summary>
internal sealed class EnumSchemaTransformer : IOpenApiSchemaTransformer
{
    public Task TransformAsync(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(schema);
        ArgumentNullException.ThrowIfNull(context);
        var type = context.JsonTypeInfo.Type;
        if ((Nullable.GetUnderlyingType(type) ?? type).IsEnum && schema.Enum is { Count: > 0 } values)
        {
            for (var i = values.Count - 1; i >= 0; i--)
            {
                if (values[i] is null)
                {
                    values.RemoveAt(i);
                }
            }

            if (schema.Type is { } kind)
            {
                schema.Type = kind & ~JsonSchemaType.Null;
            }
        }

        return Task.CompletedTask;
    }
}
