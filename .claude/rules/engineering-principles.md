# Engineering Principles: Taperday

Enforced rules. Flag violations proactively during any code review or generation task.

## Liskov Substitution / Interface Segregation
- A subtype must be usable anywhere its supertype is expected. A `NotImplementedException` on an
  interface member, or callers type-checking to route around one implementation, means the interface
  should be split instead.
- Prefer several small interfaces (`IRaceCatalogue`) over one that accumulates unrelated concerns.
- No inheritance between domain concepts just to share code; prefer composition.

## No untestable clock reads
`DateTime.Now`/`UtcNow`/`DateTimeOffset.Now` are banned in any logic that branches on the current
time (plan start dates, "is this race upcoming", validation of race dates). Inject `TimeProvider`;
tests use `FakeTimeProvider`. The domain takes "today" as a parameter and never reads a clock.

## Dependency direction
`Domain` references nothing but the BCL. `Application` references only `Domain` and defines the
abstractions it needs. `Infrastructure` implements them. `API` composes. Enforced by
`tests/StartLine.Architecture.Tests`, including a canary test that proves the rules can fail. Run them.

## Domain purity
No framework types, attributes or packages in `Domain`. Entities and value objects are plain C#.

## No ambient statics
Everything decision-relevant is constructor-injected. No service locator, no `HttpContext.Current`.

## Typed exceptions, no silent swallowing
Handlers throw `NotFoundException`/`ValidationException`, the domain throws `DomainException`, and
`ProblemDetailsExceptionHandler` maps them to RFC 9457 responses with a stable `code`. Never catch
an exception to return `null`/`default`.

## Branching & PRs
- Never commit directly to `main` once the repo is set up; work on `feature/<short-kebab-description>`.
- One branch per concern. Keep a branch current by merging `main` into it.
- Before review: `dotnet build` with 0 warnings, all tests green, frontend lint/test/build green.

## Safe test data
Automated tests must use disposable local SQL/LocalDB and synthetic data, never the production database or real runner accounts. Read `docs/testing.md`; the SQL integration suite resets rows. Run the required checks before a merge.

## Review checklist
1. New inheritance hierarchy? Check substitutability first.
2. Any clock read? Decision logic must use `TimeProvider`.
3. Touched a layer? Run the architecture tests.
4. Changed a training rule? There must be a test that names the rule.
