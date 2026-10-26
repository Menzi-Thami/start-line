using StartLine.Domain.Common;
using StartLine.Domain.Runners;

namespace StartLine.Domain.Tests.Runners;

public sealed class RunnerPhotoTests
{
    private static readonly Guid Thandi = Guid.NewGuid();
    private static readonly byte[] Jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];
    private static readonly byte[] Png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    [Fact]
    public void Takes_a_real_jpeg_and_replaces_it_with_a_real_png()
    {
        var photo = RunnerPhoto.For(Thandi, "image/jpeg", Jpeg);

        photo.Replace("image/png", Png);

        photo.ContentType.ShouldBe("image/png");
        photo.Data.ShouldBe(Png);
    }

    [Fact]
    public void Turns_away_a_file_that_isnt_the_image_it_says_it_is() =>
        Should.Throw<DomainException>(() => RunnerPhoto.For(Thandi, "image/jpeg", Png));

    [Fact]
    public void Turns_away_anything_but_jpeg_png_or_webp() =>
        Should.Throw<DomainException>(() => RunnerPhoto.For(Thandi, "image/svg+xml", "<svg/>"u8.ToArray()));

    [Fact]
    public void Turns_away_a_picture_too_big_to_be_a_small_square()
    {
        var big = new byte[RunnerPhoto.MaxBytes + 1];
        Jpeg.CopyTo(big, 0);

        Should.Throw<DomainException>(() => RunnerPhoto.For(Thandi, "image/jpeg", big));
    }
}
