using System.Collections.Concurrent;
using Microsoft.Extensions.DependencyInjection;

namespace StartLine.Application.Common.Dispatcher;

#pragma warning disable CA1040 // Marker interface: ties a request to its response type for compile-time dispatch.
public interface IRequest<TResponse>;
#pragma warning restore CA1040

public interface IRequestHandler<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    Task<TResponse> Handle(TRequest request, CancellationToken cancellationToken);
}

public delegate Task<TResponse> RequestContinuation<TResponse>();

public interface IPipelineBehaviour<in TRequest, TResponse>
    where TRequest : IRequest<TResponse>
{
    Task<TResponse> Handle(TRequest request, RequestContinuation<TResponse> continuation, CancellationToken cancellationToken);
}

public interface IDispatcher
{
    Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default);
}

internal sealed class Dispatcher(IServiceProvider services) : IDispatcher
{
    private static readonly ConcurrentDictionary<Type, Type> WrapperTypes = new();

    public Task<TResponse> Send<TResponse>(IRequest<TResponse> request, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        var wrapperType = WrapperTypes.GetOrAdd(request.GetType(),
            t => typeof(RequestWrapper<,>).MakeGenericType(t, typeof(TResponse)));
        var wrapper = (RequestWrapperBase<TResponse>)Activator.CreateInstance(wrapperType)!;
        return wrapper.Handle(request, services, cancellationToken);
    }

    private abstract class RequestWrapperBase<TResponse>
    {
        public abstract Task<TResponse> Handle(IRequest<TResponse> request, IServiceProvider services, CancellationToken cancellationToken);
    }

    private sealed class RequestWrapper<TRequest, TResponse> : RequestWrapperBase<TResponse>
        where TRequest : IRequest<TResponse>
    {
        public override Task<TResponse> Handle(IRequest<TResponse> request, IServiceProvider services, CancellationToken cancellationToken)
        {
            var typed = (TRequest)request;
            var handler = services.GetRequiredService<IRequestHandler<TRequest, TResponse>>();

            RequestContinuation<TResponse> pipeline = () => handler.Handle(typed, cancellationToken);
            foreach (var behaviour in services.GetServices<IPipelineBehaviour<TRequest, TResponse>>().Reverse())
            {
                var next = pipeline;
                pipeline = () => behaviour.Handle(typed, next, cancellationToken);
            }

            return pipeline();
        }
    }
}
