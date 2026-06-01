import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Upload, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type AssetRow = {
  id: string;
  category: string;
  name: string;
  tags: string[] | null;
  language: string | null;
  storage_path: string;
  public_url: string | null;
  enabled: boolean;
  usage_count: number | null;
  notes: string | null;
  created_at: string;
};

const CATEGORIES = ['background', 'character', 'frame', 'sticker', 'logo'] as const;

// Lazy-loaded ffmpeg singleton (browser-only).
let _ffmpegPromise: Promise<any> | null = null;
async function getFFmpeg(onLog?: (msg: string) => void) {
  if (_ffmpegPromise) return _ffmpegPromise;
  _ffmpegPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { toBlobURL } = await import('@ffmpeg/util');
    const ff = new FFmpeg();
    ff.on('log', ({ message }: { message: string }) => {
      // eslint-disable-next-line no-console
      console.log('[ffmpeg]', message);
      onLog?.(message);
    });
    ff.on('progress', ({ progress }: { progress: number }) => {
      // eslint-disable-next-line no-console
      console.log('[ffmpeg] progress', Math.round(progress * 100) + '%');
    });
    const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
    await ff.load({
      coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    return ff;
  })();
  return _ffmpegPromise;
}

async function convertMp4ToGif(
  file: File,
  opts: { width?: number; fps?: number; maxSeconds?: number; onStage?: (s: string) => void } = {}
): Promise<Blob> {
  const { fetchFile } = await import('@ffmpeg/util');
  opts.onStage?.('loading ffmpeg');
  const ff = await getFFmpeg();
  const width = opts.width ?? 240;
  const fps = opts.fps ?? 8;
  const maxSeconds = opts.maxSeconds ?? 3;
  opts.onStage?.('decoding mp4');
  await ff.writeFile('in.mp4', await fetchFile(file));
  // Single-pass split filter: one decode pass instead of two — much faster in wasm.
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
  opts.onStage?.('encoding gif');
  await ff.exec(['-t', String(maxSeconds), '-i', 'in.mp4', '-vf', filter, '-y', 'out.gif']);
  const data = await ff.readFile('out.gif');
  const u8 = data as Uint8Array;
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
  try { await ff.deleteFile('in.mp4'); await ff.deleteFile('out.gif'); } catch {}
  return new Blob([buf], { type: 'image/gif' });
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms/1000)}s`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export function NoLubeAssetLibrary() {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<string>('character');
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [language, setLanguage] = useState('en');
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [converting, setConverting] = useState(false);
  const [stage, setStage] = useState<string>('');
  const [convertingId, setConvertingId] = useState<string | null>(null);
  // User-tunable conversion controls
  const [gifWidth, setGifWidth] = useState<number>(240);
  const [gifFps, setGifFps] = useState<number>(8);
  const [gifSeconds, setGifSeconds] = useState<number>(3);
  const [keepMp4, setKeepMp4] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('no_lube_assets')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setRows((data || []) as AssetRow[]);
    } catch (e: any) {
      toast.error(`Load failed: ${e.message}`);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const handleUpload = async () => {
    if (!file) { toast.error('Pick a file'); return; }
    if (!name.trim()) { toast.error('Name required'); return; }
    setUploading(true);
    try {
      const isMp4 = file.type === 'video/mp4' || /\.mp4$/i.test(file.name);
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const stamp = Date.now();
      let uploadBlob: Blob = file;
      let ext = (file.name.split('.').pop() || 'png').toLowerCase();
      let mp4SourcePath: string | null = null;

      if (isMp4) {
        if (keepMp4) {
          // Store MP4 directly — no conversion. Browser renders via <video>.
          ext = 'mp4';
          uploadBlob = file;
        } else {
          setStage('uploading source MP4');
          mp4SourcePath = `_source/${category}/${stamp}-${slug}.mp4`;
          const { error: srcErr } = await supabase.storage.from('no-lube-assets').upload(mp4SourcePath, file, {
            contentType: 'video/mp4', upsert: false,
          });
          if (srcErr) throw srcErr;

          setConverting(true);
          try {
            uploadBlob = await withTimeout(
              convertMp4ToGif(file, {
                width: gifWidth, fps: gifFps, maxSeconds: gifSeconds,
                onStage: setStage,
              }),
              120_000,
              'GIF conversion'
            );
            console.log('[no-lube] GIF produced, bytes=', (uploadBlob as Blob).size);
          } finally { setConverting(false); setStage(''); }
          ext = 'gif';
        }
      }

      setStage(isMp4 && keepMp4 ? 'uploading mp4' : (isMp4 ? 'uploading gif' : 'uploading'));
      const path = `${category}/${stamp}-${slug}.${ext}`;
      const { error: upErr } = await supabase.storage.from('no-lube-assets').upload(path, uploadBlob, {
        contentType: isMp4
          ? (keepMp4 ? 'video/mp4' : 'image/gif')
          : (file.type || 'image/png'),
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('no-lube-assets').getPublicUrl(path);
      const finalNotes = [notes.trim(), mp4SourcePath ? `mp4_source=${mp4SourcePath}` : '']
        .filter(Boolean).join(' | ');
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      const { error: insErr } = await (supabase as any).from('no_lube_assets').insert({
        category, name: name.trim(), tags: tagList,
        language: language.trim() || null,
        storage_path: path, public_url: pub.publicUrl,
        enabled: true, notes: finalNotes || null,
      });
      if (insErr) throw insErr;
      toast.success(isMp4 ? 'MP4 converted to GIF and uploaded' : 'Asset uploaded');
      setName(''); setTags(''); setNotes(''); setFile(null);
      void load();
    } catch (e: any) {
      console.error('[no-lube] upload failed', e);
      toast.error(`Upload failed: ${e.message}`);
    } finally { setUploading(false); setStage(''); }
  };

  const toggleEnabled = async (row: AssetRow) => {
    const { error } = await (supabase as any)
      .from('no_lube_assets').update({ enabled: !row.enabled }).eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setRows(rs => rs.map(r => r.id === row.id ? { ...r, enabled: !row.enabled } : r));
  };

  const remove = async (row: AssetRow) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    await supabase.storage.from('no-lube-assets').remove([row.storage_path]).catch(() => {});
    const { error } = await (supabase as any).from('no_lube_assets').delete().eq('id', row.id);
    if (error) { toast.error(error.message); return; }
    setRows(rs => rs.filter(r => r.id !== row.id));
  };

  const convertRowToGif = async (row: AssetRow) => {
    if (!/\.mp4$/i.test(row.storage_path)) return;
    setConvertingId(row.id);
    setStage('downloading mp4');
    try {
      const { data: dl, error: dlErr } = await supabase.storage
        .from('no-lube-assets').download(row.storage_path);
      if (dlErr || !dl) throw dlErr || new Error('download failed');
      const mp4File = new File([dl], 'in.mp4', { type: 'video/mp4' });
      const gifBlob = await withTimeout(
        convertMp4ToGif(mp4File, {
          width: gifWidth, fps: gifFps, maxSeconds: gifSeconds,
          onStage: setStage,
        }),
        120_000,
        'GIF conversion'
      );
      setStage('uploading gif');
      const stamp = Date.now();
      const slug = `${row.name}-gif`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${row.category}/${stamp}-${slug}.gif`;
      const { error: upErr } = await supabase.storage.from('no-lube-assets').upload(path, gifBlob, {
        contentType: 'image/gif', upsert: false,
      });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('no-lube-assets').getPublicUrl(path);
      const { error: insErr } = await (supabase as any).from('no_lube_assets').insert({
        category: row.category,
        name: `${row.name}_gif`,
        tags: row.tags || [],
        language: row.language,
        storage_path: path,
        public_url: pub.publicUrl,
        enabled: true,
        notes: `converted_from=${row.storage_path}`,
      });
      if (insErr) throw insErr;
      toast.success('GIF created from MP4');
      void load();
    } catch (e: any) {
      console.error('[no-lube] convert-to-gif failed', e);
      toast.error(`Convert failed: ${e.message}`);
    } finally {
      setConvertingId(null);
      setStage('');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-card/60 border-border">
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Upload new asset</Label>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs">Category</Label>
              <select
                value={category} onChange={e => setCategory(e.target.value)}
                className="w-full bg-background border border-border rounded h-9 px-2 text-sm"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="frog_pepe_01" />
            </div>
            <div>
              <Label className="text-xs">Tags (comma)</Label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="meme,frog,hype" />
            </div>
            <div>
              <Label className="text-xs">Language</Label>
              <Input value={language} onChange={e => setLanguage(e.target.value)} placeholder="en" />
            </div>
            <div>
              <Label className="text-xs">File</Label>
              <Input type="file" accept="image/*,video/mp4" onChange={e => setFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional usage hints for the AI prompt" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end border-t border-border/40 pt-3">
            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="keep-mp4" type="checkbox" checked={keepMp4}
                onChange={e => setKeepMp4(e.target.checked)}
                className="h-4 w-4 accent-pink-600"
              />
              <Label htmlFor="keep-mp4" className="text-xs cursor-pointer">
                Store MP4 directly (skip GIF conversion)
              </Label>
            </div>
            <div>
              <Label className="text-xs">GIF width (px)</Label>
              <Input type="number" min={120} max={640} step={20}
                value={gifWidth} disabled={keepMp4}
                onChange={e => setGifWidth(Math.max(80, Math.min(800, Number(e.target.value) || 240)))} />
            </div>
            <div>
              <Label className="text-xs">FPS</Label>
              <Input type="number" min={4} max={20} step={1}
                value={gifFps} disabled={keepMp4}
                onChange={e => setGifFps(Math.max(2, Math.min(24, Number(e.target.value) || 8)))} />
            </div>
            <div>
              <Label className="text-xs">Max seconds</Label>
              <Input type="number" min={1} max={10} step={1}
                value={gifSeconds} disabled={keepMp4}
                onChange={e => setGifSeconds(Math.max(1, Math.min(15, Number(e.target.value) || 3)))} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleUpload} disabled={uploading || !file || !name.trim()} className="bg-pink-600 hover:bg-pink-700">
              {(uploading || converting) ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
              {converting ? `Converting MP4 → GIF… ${stage}` : (uploading ? (stage || 'Uploading…') : 'Upload')}
            </Button>
            <span className="text-[10px] text-muted-foreground">
              {keepMp4
                ? 'MP4 will be stored as-is (no conversion). Fast & reliable; rendered via <video>.'
                : `MP4 → GIF (${gifWidth}px, ${gifFps}fps, capped ${gifSeconds}s). 120s timeout. See console for [ffmpeg] logs.`}
            </span>
          </div>
        </CardContent>
      </Card>

      <div>
        <Label className="text-sm font-semibold">Library ({rows.length})</Label>
        {loading ? (
          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground mt-2">No assets yet — upload your first meme reference above.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-2">
            {rows.map(r => (
              <Card key={r.id} className={`bg-card/60 ${r.enabled ? 'border-pink-500/40' : 'border-border opacity-50'}`}>
                <CardContent className="p-2 space-y-2">
                  {r.public_url && (
                    /\.mp4$/i.test(r.storage_path) ? (
                      <video src={r.public_url} muted loop autoPlay playsInline
                        className="w-full h-24 object-cover rounded border border-border" />
                    ) : (
                      <img src={r.public_url} alt={r.name}
                        className="w-full h-24 object-cover rounded border border-border" />
                    )
                  )}
                  <div className="text-xs font-mono truncate" title={r.name}>{r.name}</div>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="text-[10px]">{r.category}</Badge>
                    {r.language && <Badge variant="outline" className="text-[10px]">{r.language}</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="flex-1 h-7 text-[10px]" onClick={() => toggleEnabled(r)}>
                      {r.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => remove(r)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {/\.mp4$/i.test(r.storage_path) && (
                    <Button
                      size="sm" variant="outline"
                      className="w-full h-7 text-[10px] border-pink-500/40"
                      disabled={convertingId === r.id}
                      onClick={() => convertRowToGif(r)}
                    >
                      {convertingId === r.id
                        ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />{stage || 'converting…'}</>
                        : '→ Convert to GIF'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}