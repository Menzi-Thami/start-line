using System.Globalization;
using System.Net;
using System.Text;

namespace StartLine.Application.Features.Insights;

/// <summary>
/// Taperday's email look, in the Night run colours: near-black ground, a dark card, one volt accent and the runner
/// peeking over the top of the card, smiling. Built from tables with inline styles, which is what email apps render
/// reliably; the mascot is a PNG on taperday.run because most email apps won't show SVG.
/// </summary>
public static class EmailLayout
{
    public const string Site = "https://taperday.run";
    public const string Paper = "#0a0a0b";
    public const string Surface = "#16171a";
    public const string Ink = "#f2f2f2";
    public const string Muted = "#9a9ca3";
    public const string Volt = "#d7ff3e";
    public const string Line = "#2a2c31";
    private const string Font = "'Bricolage Grotesque','Segoe UI',Helvetica,Arial,sans-serif";

    public static string Encode(string text) => WebUtility.HtmlEncode(text);

    /// <summary>The whole email around a body: preheader, mascot, kicker and title, the body, one button and the footer.</summary>
    public static string Wrap(string preheader, string kicker, string title, string body, string buttonText, string buttonUrl, string footer)
    {
        var html = new StringBuilder();
        html.Append(CultureInfo.InvariantCulture, $"""
            <!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>{Encode(title)}</title></head>
            <body style="margin:0;padding:0;background:{Paper};">
            <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{Paper};">{Encode(preheader)}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{Paper};"><tr><td align="center" style="padding:28px 12px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
            <tr><td style="padding:0 4px 18px;font-family:{Font};font-size:22px;font-weight:800;letter-spacing:-0.5px;"><span style="color:{Ink};">taper</span><span style="color:{Volt};">day</span></td></tr>
            <tr><td align="center" style="line-height:0;"><img src="{Site}/email/peek.png" width="240" height="66" alt="The Taperday runner peeking over the page" style="display:block;border:0;width:240px;height:66px;"></td></tr>
            <tr><td style="background:{Surface};border-top:3px solid {Volt};border-radius:20px;padding:12px 28px 30px;font-family:{Font};color:{Ink};">
            <p style="margin:12px 0 6px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:{Volt};">{Encode(kicker)}</p>
            <h1 style="margin:0 0 18px;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-0.5px;color:{Ink};">{Encode(title)}</h1>
            {body}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px;"><tr><td style="background:{Volt};border-radius:999px;"><a href="{buttonUrl}" style="display:inline-block;padding:14px 26px;font-family:{Font};font-size:16px;font-weight:800;color:{Paper};text-decoration:none;">{Encode(buttonText)}</a></td></tr></table>
            </td></tr>
            <tr><td style="padding:18px 8px 0;font-family:{Font};font-size:12px;line-height:1.6;color:{Muted};">{footer}</td></tr>
            </table></td></tr></table></body></html>
            """);
        return html.ToString();
    }

    /// <summary>Big figures side by side: the headline of an email.</summary>
    public static string Figures(params (string Label, string Value)[] figures)
    {
        ArgumentNullException.ThrowIfNull(figures);
        var html = new StringBuilder($"<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 20px;\"><tr>");
        foreach (var (label, value) in figures)
        {
            html.Append(CultureInfo.InvariantCulture, $"<td width=\"{100 / figures.Length}%\" style=\"padding:14px 12px;border:1px solid {Line};border-radius:14px;font-family:{Font};\"><div style=\"font-size:30px;font-weight:800;color:{Volt};line-height:1;\">{Encode(value)}</div><div style=\"margin-top:6px;font-size:12px;color:{Muted};\">{Encode(label)}</div></td>");
        }

        return html.Append("</tr></table>").ToString();
    }

    /// <summary>A labelled row with a volt bar for a share (0 to 1) and the figure at the end.</summary>
    public static string Bar(string label, double share, string value)
    {
        var width = Math.Clamp((int)Math.Round(share * 100), 0, 100);
        return string.Create(CultureInfo.InvariantCulture, $"""
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr><td style="font-family:{Font};font-size:14px;color:{Ink};padding-bottom:6px;">{Encode(label)}</td><td align="right" style="font-family:{Font};font-size:14px;font-weight:700;color:{Ink};padding-bottom:6px;">{Encode(value)}</td></tr>
            <tr><td colspan="2" style="background:{Line};border-radius:999px;height:8px;line-height:8px;font-size:0;"><div style="width:{width}%;background:{Volt};border-radius:999px;height:8px;line-height:8px;font-size:0;">&nbsp;</div></td></tr></table>
            """);
    }

    public static string Heading(string text) =>
        string.Create(CultureInfo.InvariantCulture, $"<h2 style=\"margin:26px 0 12px;font-family:{Font};font-size:16px;font-weight:800;color:{Ink};\">{Encode(text)}</h2>");

    public static string Paragraph(string text, bool muted = false) =>
        string.Create(CultureInfo.InvariantCulture, $"<p style=\"margin:0 0 12px;font-family:{Font};font-size:15px;line-height:1.55;color:{(muted ? Muted : Ink)};\">{Encode(text)}</p>");

    /// <summary>A quoted note with a volt rule down its left, and who/where/when underneath in grey.</summary>
    public static string Note(string text, string meta) =>
        string.Create(CultureInfo.InvariantCulture, $"<div style=\"margin:0 0 12px;padding:10px 14px;border-left:3px solid {Volt};background:{Paper};border-radius:0 10px 10px 0;font-family:{Font};\"><div style=\"font-size:15px;line-height:1.5;color:{Ink};\">{Encode(text)}</div><div style=\"margin-top:4px;font-size:12px;color:{Muted};\">{Encode(meta)}</div></div>");
}
