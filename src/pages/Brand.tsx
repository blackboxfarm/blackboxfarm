import React, { useRef, useState } from "react";
import { Check, Copy, Download, ImageDown, Star } from "lucide-react";
import { toast } from "sonner";

import { SiteLayout } from "@/components/layout/SiteLayout";
import { Button } from "@/components/ui/button";
import { BRAND_COLORS, BRAND_PALETTE, BRAND_TAGLINES, BRAND_TYPOGRAPHY } from "@/lib/brand";
import { LOGO_VARIANTS, MarkCube, Wordmark, type LogoVariant } from "@/components/brand/logos";
import {
  BANNER_PRESETS,
  bannerToPng,
  markToPng,
  serializeSvg,
  triggerDownload,
  type BannerStyle,
} from "@/lib/brandExport";

const PNG_SIZES = [256, 512, 1024];
const STYLES: Array<{ id: BannerStyle; label: string }> = [
  { id: "void", label: "Void" },
  { id: "grid", label: "Cyan grid" },
  { id: "gold", label: "Gold" },
];

function downloadSvg(name: string, svg: SVGSVGElement) {
  triggerDownload(name, new Blob([serializeSvg(svg)], { type: "image/svg+xml;charset=utf-8" }));
}

function styleBackground(style: BannerStyle): string {
  if (style === "gold") return `linear-gradient(100deg, ${BRAND_COLORS.gold}, #7A5A02)`;
  if (style === "grid") return `linear-gradient(135deg, ${BRAND_COLORS.void}, #0A2630)`;
  return `linear-gradient(135deg, ${BRAND_COLORS.void}, ${BRAND_COLORS.carbon})`;
}

function useSeo() {
  React.useEffect(() => {
    document.title = "Brand & logo library — BlackBox Farm";
    const set = (sel: string, attr: string, val: string, content: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(sel);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, val);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    const desc =
      "BlackBox Farm brand library — logo directions, the Signal Cyan palette, typography, usage rules and download-ready SVG, PNG and social banners.";
    set('meta[name="description"]', "name", "description", desc);
    set('meta[property="og:title"]', "property", "og:title", "Brand & logo library — BlackBox Farm");
    set('meta[property="og:description"]', "property", "og:description", desc);
    set('meta[property="og:type"]', "property", "og:type", "website");
    set('meta[name="twitter:card"]', "name", "twitter:card", "summary_large_image");
  }, []);
}

function LogoCard({ variant, style }: { variant: LogoVariant; style: BannerStyle }) {
  const ref = useRef<HTMLDivElement>(null);
  const { Mark, stacked } = variant;
  const inverse = style !== "gold";

  const getSvg = () => ref.current?.querySelector("svg") as SVGSVGElement | null;

  const handleSvg = () => {
    const svg = getSvg();
    if (!svg) return;
    downloadSvg(`blackbox-farm-${variant.id}.svg`, svg);
    toast.success(`${variant.name} downloaded as SVG`);
  };

  const handlePng = async (size: number, transparent: boolean) => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await markToPng(svg, size, transparent ? null : style);
      triggerDownload(
        `blackbox-farm-${variant.id}-${size}${transparent ? "-transparent" : ""}.png`,
        blob,
      );
      toast.success(`PNG ${size}px${transparent ? " (transparent)" : ""} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PNG export failed");
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div
        ref={ref}
        className="flex min-h-[210px] items-center justify-center px-8 py-12"
        style={{ background: styleBackground(style) }}
      >
        <div className={stacked ? "flex flex-col items-center gap-4" : "flex items-center gap-4"}>
          <Mark size={stacked ? 88 : 64} inverse={inverse} />
          <Wordmark inverse={inverse} className={stacked ? "text-2xl text-center" : "text-2xl"} />
        </div>
      </div>

      <div className="space-y-3 border-t border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold">{variant.name}</h3>
          <div className="shrink-0 rounded-full bg-muted px-3 py-1">
            <Mark size={22} inverse />
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{variant.story}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{variant.bestFor}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleSvg}>
            <Download className="mr-2 h-4 w-4" />
            SVG
          </Button>
          {PNG_SIZES.map((s) => (
            <Button key={s} variant="ghost" size="sm" onClick={() => handlePng(s, false)}>
              PNG {s}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => handlePng(1024, true)}>
            <ImageDown className="mr-2 h-4 w-4" />
            Transparent PNG
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChosenIdentity() {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<BannerStyle>("grid");
  const [tagline, setTagline] = useState(BRAND_TAGLINES[0]);
  const inverse = style !== "gold";

  const getSvg = () => ref.current?.querySelector("svg") as SVGSVGElement | null;

  const exportMark = async (size: number, transparent: boolean) => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await markToPng(svg, size, transparent ? null : style);
      triggerDownload(
        `blackbox-farm-box-${style}-${size}${transparent ? "-transparent" : ""}.png`,
        blob,
      );
      toast.success(`Mark PNG ${size}px ${style}${transparent ? " (transparent)" : ""} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PNG export failed");
    }
  };

  const exportBanner = async (presetId: string) => {
    const svg = getSvg();
    const preset = BANNER_PRESETS.find((p) => p.id === presetId);
    if (!svg || !preset) return;
    try {
      const blob = await bannerToPng(svg, preset, style, tagline);
      triggerDownload(
        `blackbox-farm-banner-${preset.id}-${preset.width}x${preset.height}-${style}.png`,
        blob,
      );
      toast.success(`${preset.label} ${preset.width}×${preset.height} downloaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Banner export failed");
    }
  };

  return (
    <section className="mt-10 overflow-hidden rounded-2xl border-2 border-primary/40 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-primary/5 px-6 py-4">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          <h2 className="text-xl font-semibold">Chosen identity — 01 The Box</h2>
        </div>
        <span className="text-xs font-medium uppercase tracking-wide text-primary">Locked. Export below.</span>
      </div>

      <div className="grid gap-0 md:grid-cols-2">
        <div
          ref={ref}
          className="flex flex-col items-center justify-center gap-5 px-8 py-12"
          style={{ background: styleBackground(style) }}
        >
          <MarkCube size={130} inverse={inverse} />
          <Wordmark inverse={inverse} className="text-3xl" />
          {tagline ? (
            <p
              className="text-center font-mono text-xs md:text-sm"
              style={{ color: inverse ? BRAND_COLORS.mist : BRAND_COLORS.void, opacity: 0.85 }}
            >
              {tagline}
            </p>
          ) : null}
        </div>

        <div className="space-y-6 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Background</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={style === s.id ? "default" : "outline"}
                  onClick={() => setStyle(s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tagline</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND_TAGLINES.map((t, i) => (
                <Button
                  key={i}
                  size="sm"
                  variant={tagline === t ? "default" : "outline"}
                  onClick={() => setTagline(t)}
                >
                  {t === "" ? "No tagline" : i === 0 ? "Needle" : "Forensics"}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mark files</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const svg = getSvg();
                  if (svg) {
                    downloadSvg("blackbox-farm-box.svg", svg);
                    toast.success("Mark downloaded as SVG");
                  }
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                SVG
              </Button>
              {PNG_SIZES.map((s) => (
                <Button key={s} size="sm" variant="ghost" onClick={() => exportMark(s, false)}>
                  PNG {s}
                </Button>
              ))}
              {[512, 1024].map((s) => (
                <Button key={`t${s}`} size="sm" variant="ghost" onClick={() => exportMark(s, true)}>
                  <ImageDown className="mr-2 h-4 w-4" />
                  {s} transparent
                </Button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Banners</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {BANNER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => exportBanner(p.id)}
                  className="rounded-xl border border-border bg-muted/40 p-3 text-left transition-colors hover:border-primary/60 hover:bg-muted"
                >
                  <span className="block text-sm font-medium">{p.label}</span>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {p.width}×{p.height}
                  </span>
                  <span className="block pt-1 text-xs text-muted-foreground">{p.note}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Banners render with the background and tagline selected above.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Swatch({ name, hex, token, role }: (typeof BRAND_PALETTE)[number]) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(hex);
    setCopied(true);
    toast.success(`${hex} copied`);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="overflow-hidden rounded-2xl border border-border bg-card text-left transition-shadow hover:shadow-md"
    >
      <div className="h-24 w-full" style={{ backgroundColor: hex }} />
      <div className="space-y-1 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium">{name}</span>
          {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
        </div>
        <p className="font-mono text-xs uppercase text-muted-foreground">{hex}</p>
        <p className="font-mono text-xs text-muted-foreground">{token}</p>
        <p className="pt-1 text-xs text-muted-foreground">{role}</p>
      </div>
    </button>
  );
}

export default function Brand() {
  useSeo();
  const [style, setStyle] = useState<BannerStyle>("void");

  return (
    <SiteLayout>
      <main className="container mx-auto px-4 py-12">
        <header className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Brand library</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight md:text-5xl">
            The Box, and the five it came from.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Every mark here is drawn in code, so it exports crisp at any size. Pick a background, pick a
            tagline, and pull down SVG, PNG, transparent PNG or a ready-made social banner. The other five
            directions stay on file for reference.
          </p>
        </header>

        <ChosenIdentity />

        <section className="mt-16">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Logo directions</h2>
            <div className="flex flex-wrap gap-2">
              {STYLES.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  variant={style === s.id ? "default" : "outline"}
                  onClick={() => setStyle(s.id)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {LOGO_VARIANTS.map((v) => (
              <LogoCard key={v.id} variant={v} style={style} />
            ))}
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold">Colour — Signal on Void</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Cyan leads, gold marks anything premium or urgent, violet carries the mesh. Click any swatch to copy the hex.
          </p>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {BRAND_PALETTE.map((c) => (
              <Swatch key={c.hex} {...c} />
            ))}
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            <div
              className="flex h-24 items-center justify-center text-xl font-semibold"
              style={{
                background: `linear-gradient(100deg, ${BRAND_COLORS.void}, ${BRAND_COLORS.cyanDeep} 60%, ${BRAND_COLORS.cyan})`,
                color: BRAND_COLORS.void,
              }}
            >
              Signature gradient — void to signal
            </div>
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold">Typography</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-3">
            {BRAND_TYPOGRAPHY.map((f) => (
              <div key={f.name} className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold">{f.name}</h3>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{f.role}</span>
                </div>
                <p
                  className="mt-4 break-all text-xl leading-tight"
                  style={{ fontFamily: f.stack, fontWeight: 600 }}
                >
                  {f.sample}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">{f.notes}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-20">
          <h2 className="text-2xl font-semibold">Using the marks</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-primary/40 bg-primary/5 p-6">
              <h3 className="text-lg font-semibold text-primary">Do</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Keep clear space around the mark equal to one cube face.</li>
                <li>Use the light lockup on void or violet, the dark lockup on gold.</li>
                <li>Below 24px, drop the wordmark and ship the mark alone.</li>
                <li>Keep the wordmark at 700 with “Box” in Signal Cyan.</li>
                <li>Render addresses, mints and metrics in mono, never truncated in reports.</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
              <h3 className="text-lg font-semibold text-destructive">Don’t</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>Don’t recolour a mark outside the palette above.</li>
                <li>Don’t stretch, skew, rotate or add drop shadows and outlines.</li>
                <li>Don’t put the mark on a busy chart screenshot without a dark scrim.</li>
                <li>Don’t mix two different marks in one layout.</li>
                <li>Don’t use Comic Neue for data, prices or wallet addresses.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mt-20 rounded-2xl border border-border bg-muted/40 p-8">
          <h2 className="text-2xl font-semibold">Favicon &amp; avatar set</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            How each mark holds up small. Tell me which one you want and I’ll wire it into the header, favicon
            and social cards site-wide.
          </p>
          <div className="mt-6 flex flex-wrap gap-8">
            {LOGO_VARIANTS.map(({ id, Mark }) => (
              <div key={id} className="flex flex-col items-center gap-3">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-sm">
                  <Mark size={44} inverse />
                </div>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-card shadow-sm">
                  <Mark size={22} inverse />
                </div>
                <Mark size={16} inverse />
              </div>
            ))}
          </div>
        </section>
      </main>
    </SiteLayout>
  );
}