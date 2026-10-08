using System.Reflection;
using ArchUnitNET.Domain;
using ArchUnitNET.Fluent;
using ArchUnitNET.Loader;
using ArchUnitNET.xUnit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;
using Assembly = System.Reflection.Assembly;

namespace StartLine.Architecture.Tests;

public sealed class LayerTests
{
    private static readonly Assembly DomainAssembly = typeof(Domain.Running.Pace).Assembly;
    private static readonly Assembly ApplicationAssembly = typeof(Application.DependencyInjection).Assembly;
    private static readonly Assembly InfrastructureAssembly = typeof(Infrastructure.DependencyInjection).Assembly;
    private static readonly Assembly ApiAssembly = typeof(Program).Assembly;

    private static readonly ArchUnitNET.Domain.Architecture Architecture = new ArchLoader()
        .LoadAssemblies(DomainAssembly, ApplicationAssembly, InfrastructureAssembly, ApiAssembly)
        .Build();

    // Selected by assembly, not namespace: a namespace filter can silently match nothing and pass.
    private static readonly IObjectProvider<IType> DomainLayer = Types().That().ResideInAssembly(DomainAssembly).As("Domain");
    private static readonly IObjectProvider<IType> ApplicationLayer = Types().That().ResideInAssembly(ApplicationAssembly).As("Application");
    private static readonly IObjectProvider<IType> InfrastructureLayer = Types().That().ResideInAssembly(InfrastructureAssembly).As("Infrastructure");
    private static readonly IObjectProvider<IType> ApiLayer = Types().That().ResideInAssembly(ApiAssembly).As("API");

    [Fact]
    public void Domain_depends_on_no_other_layer() =>
        Types().That().Are(DomainLayer)
            .Should().NotDependOnAny(ApplicationLayer)
            .AndShould().NotDependOnAny(InfrastructureLayer)
            .AndShould().NotDependOnAny(ApiLayer)
            .Check(Architecture);

    [Fact]
    public void Application_depends_only_on_the_domain() =>
        Types().That().Are(ApplicationLayer)
            .Should().NotDependOnAny(InfrastructureLayer)
            .AndShould().NotDependOnAny(ApiLayer)
            .Check(Architecture);

    [Fact]
    public void Infrastructure_does_not_depend_on_the_api() =>
        Types().That().Are(InfrastructureLayer)
            .Should().NotDependOnAny(ApiLayer)
            .Check(Architecture);

    [Fact]
    public void Handlers_are_sealed_and_internal() =>
        Classes().That().Are(ApplicationLayer).And().HaveNameEndingWith("Handler")
            .Should().BeSealed()
            .AndShould().NotBePublic()
            .Check(Architecture);

    [Fact]
    public void The_rules_can_actually_fail()
    {
        // Canary: the API does depend on Application, so this rule must be reported as broken.
        // If it ever passes, the loader has stopped seeing dependencies and every rule above is hollow.
        var impossible = Types().That().Are(ApiLayer).Should().NotDependOnAny(ApplicationLayer);

        impossible.HasNoViolations(Architecture).ShouldBeFalse();
    }

    [Fact]
    public void Domain_references_nothing_but_the_base_class_library()
    {
        var references = DomainAssembly.GetReferencedAssemblies().Select(a => a.Name!).ToList();

        references.ShouldNotBeEmpty();
        references.ShouldAllBe(name => name.StartsWith("System", StringComparison.Ordinal) || name == "netstandard");
    }

    [Fact]
    public void Application_references_no_web_or_data_framework()
    {
        var references = ApplicationAssembly.GetReferencedAssemblies().Select(a => a.Name!).ToList();

        references.ShouldNotContain(name => name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal));
        references.ShouldNotContain(name => name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal));
        references.ShouldNotContain("StartLine.Infrastructure");
        references.ShouldNotContain("StartLine.API");
    }
}
