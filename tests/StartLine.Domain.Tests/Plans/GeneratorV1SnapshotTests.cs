using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using StartLine.Domain.Plans;
using StartLine.Domain.Running;

namespace StartLine.Domain.Tests.Plans;

/// <summary>
/// Version 1 plans are what every link and saved plan made before generator v2 was built with. They must keep
/// generating exactly as they did, so each case here is a hash of a whole plan as it was before v2 existed.
/// If one fails, version 1's behaviour changed: put it back rather than updating the hash.
/// </summary>
public sealed class GeneratorV1SnapshotTests
{
    private static readonly DateOnly Today = new(2026, 10, 8);

    private static readonly DayOfWeek[] ThreeDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Sunday];
    private static readonly DayOfWeek[] FourDays = [DayOfWeek.Tuesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];
    private static readonly DayOfWeek[] FiveDays = [DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    private static readonly DayOfWeek[] SixDays =
        [DayOfWeek.Monday, DayOfWeek.Tuesday, DayOfWeek.Wednesday, DayOfWeek.Thursday, DayOfWeek.Saturday, DayOfWeek.Sunday];

    // Paces carry full double precision, and the last digit of Math.Pow can differ between Windows and Linux.
    private static readonly JsonSerializerOptions Json = new() { Converters = { new JsonStringEnumConverter(), new TwelveDigits() } };

    private static readonly Dictionary<string, PlanParameters> Cases = new()
    {
        ["5k-new-3-days"] = new(Distance.FiveK, TimeSpan.FromMinutes(32), new DateOnly(2027, 1, 10), Today, ThreeDays, DayOfWeek.Sunday, null, Experience.New),
        ["5k-regular-5-days"] = new(Distance.FiveK, TimeSpan.FromMinutes(22), new DateOnly(2027, 1, 10), Today, FiveDays, DayOfWeek.Sunday, 30),
        ["10k-experienced-6-days"] = new(Distance.TenK, TimeSpan.FromMinutes(42), new DateOnly(2027, 1, 31), Today, SixDays, DayOfWeek.Sunday, 45, Experience.Experienced),
        ["10k-new-4-days-strength"] = new(Distance.TenK, TimeSpan.FromMinutes(60), new DateOnly(2027, 1, 31), Today, FourDays, DayOfWeek.Sunday, 15, Experience.New, [DayOfWeek.Monday, DayOfWeek.Wednesday]),
        ["half-new-4-days"] = new(Distance.HalfMarathon, TimeSpan.FromHours(2.25), new DateOnly(2027, 2, 28), Today, FourDays, DayOfWeek.Sunday, null, Experience.New),
        ["half-regular-5-days"] = new(Distance.HalfMarathon, TimeSpan.FromHours(1.75), new DateOnly(2027, 1, 24), Today, FiveDays, DayOfWeek.Sunday, 35),
        ["marathon-regular-5-days"] = new(Distance.Marathon, TimeSpan.FromHours(4), new DateOnly(2027, 2, 28), Today, FiveDays, DayOfWeek.Sunday, 40),
        ["marathon-new-3-days"] = new(Distance.Marathon, TimeSpan.FromHours(5), new DateOnly(2027, 3, 21), Today, ThreeDays, DayOfWeek.Sunday, 20, Experience.New),
        ["marathon-experienced-6-days-short"] = new(Distance.Marathon, TimeSpan.FromHours(3), new DateOnly(2026, 12, 20), Today, SixDays, DayOfWeek.Sunday, 70, Experience.Experienced),
        ["marathon-slow-runner-time-cap"] = new(Distance.Marathon, TimeSpan.FromHours(6), new DateOnly(2027, 2, 28), Today, FiveDays, DayOfWeek.Sunday, 60),
        ["ultra-two-oceans"] = new(Distance.FromKilometres(56), TimeSpan.FromHours(6), new DateOnly(2027, 4, 3), Today, FiveDays, DayOfWeek.Sunday, 50),
        ["long-ultra-comrades-far-off"] = new(Distance.FromKilometres(90), TimeSpan.FromHours(11), new DateOnly(2027, 9, 26), Today, FiveDays, DayOfWeek.Sunday, 50),
        ["marathon-replan-illness"] = new(Distance.Marathon, TimeSpan.FromHours(4), new DateOnly(2027, 2, 28), Today, FiveDays, DayOfWeek.Sunday, 40,
            Replan: new PlanReplan(new DateOnly(2026, 12, 3), Setback.Illness)),
        ["half-replan-behind"] = new(Distance.HalfMarathon, TimeSpan.FromHours(1.75), new DateOnly(2027, 1, 24), Today, FiveDays, DayOfWeek.Sunday, 35,
            Replan: new PlanReplan(new DateOnly(2026, 11, 18), Setback.Behind, 20)),
        ["10k-replan-injury"] = new(Distance.TenK, TimeSpan.FromMinutes(42), new DateOnly(2027, 1, 31), Today, SixDays, DayOfWeek.Sunday, 45, Experience.Experienced,
            Replan: new PlanReplan(new DateOnly(2026, 11, 20), Setback.Injury, 30)),
    };

    // SHA-256 of each plan, generated before generator v2 was added.
    private static readonly Dictionary<string, string> Expected = new()
    {
        ["10k-experienced-6-days"] = "64B6DD7054C3B949C46080030449ADFC83E9BB029A8DE73D43FA260CB1A10FBE",
        ["10k-new-4-days-strength"] = "B049BA11CB28C78506636170E15D2C4BD1503B811BA77E1AA26C4F8BB4D6DCDE",
        ["10k-replan-injury"] = "015A28FAF72F02940388B76E915DC48300B31B97CEABC6C2DC0AD8D99FD51BDC",
        ["5k-new-3-days"] = "EC2388E8399EF1257AA17F56837077C85AF88A0A6DBE8E56C5E8C560E0DFD067",
        ["5k-regular-5-days"] = "D4C0573502EABF631515373D829DFA24ED8AFF48B52B23404DEF7A59DE93C120",
        ["half-new-4-days"] = "1F07AF6B6724304B0680B2D912E0227014DE710A29C710CD3760A99E5CC9ACC1",
        ["half-regular-5-days"] = "3995E7D27393A44C7794F3481909FAA12A8BAA0AA2A7C25CCC9519633EDBE0FB",
        ["half-replan-behind"] = "211BB5A77EFFCC04A9EE62ABA968C524C248B076416E26D13E1557B70F4F7031",
        ["long-ultra-comrades-far-off"] = "57A26F588E142B1312AA52260A2B61DAD09DC74F532B06AFB18B7E5AAC836500",
        ["marathon-experienced-6-days-short"] = "9412C1DBBC242AB311B3FBCCCE3CE4C9C1ABF0B75367A0E131271018698BA3C7",
        ["marathon-new-3-days"] = "5073BFA269E7F51528D4149D12DB814B604369934FFB8AE781483129838B2A4E",
        ["marathon-regular-5-days"] = "2B66C1DB68E07DBB55B190175285CE742DF35BD24A179D4A1F8F5E894C513B78",
        ["marathon-replan-illness"] = "E9023CD01B19625530A6380DDD5879C01A7B2679B0CBADDB66E1734D37915A2F",
        ["marathon-slow-runner-time-cap"] = "B6CB23CCC1F057DC3EBE863F3DECB85349B46DB80BC99B089DAC6C5E438413CE",
        ["ultra-two-oceans"] = "E9170BACB6C0ECAAC56821359DC683CB1A42874794475D96A842B534E461DA74",
    };

    public static TheoryData<string> CaseNames() => [.. Cases.Keys];

    [Theory]
    [MemberData(nameof(CaseNames))]
    public void Version_1_plans_are_unchanged_byte_for_byte(string name)
    {
        var plan = TrainingPlanGenerator.Generate(Cases[name]);

        Hash(plan).ShouldBe(Expected.GetValueOrDefault(name), $"Version 1 output changed for {name}.");
    }

    private static string Hash(TrainingPlan plan) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(plan, Json))));

    private sealed class TwelveDigits : JsonConverter<double>
    {
        public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) => reader.GetDouble();

        public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options) =>
            writer.WriteRawValue(value.ToString("G12", CultureInfo.InvariantCulture));
    }
}
