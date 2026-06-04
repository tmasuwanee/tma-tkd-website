import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Upload, Trash2, Image as ImageIcon, Video, Eye, EyeOff, LogOut, Camera, Tag, X, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─── Auth (matches /admin/registrations pattern) ────────────────────────────
const ALLOWED_EMAILS = ["tmasuwanee@gmail.com", "coacharfasc@gmail.com"];
const STUDIO_PASSWORD = "Keep9oing!";
const SESSION_KEY = "tma_studio_session";

const VERTICALS = [
  { value: "afterschool", label: "After-School" },
  { value: "tkd", label: "Taekwondo" },
  { value: "kickboxing", label: "Kickboxing" },
  { value: "bjj", label: "BJJ" },
  { value: "summer_camp", label: "Summer Camp" },
  { value: "spring_break_camp", label: "Spring Break Camp" },
  { value: "camps_general", label: "Camps (General)" },
  { value: "all_programs", label: "All Programs" },
] as const;

type Vertical = typeof VERTICALS[number]["value"];

function LoginGate({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ALLOWED_EMAILS.includes(email.trim().toLowerCase()) && password === STUDIO_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, email.trim().toLowerCase());
      onLogin(email.trim().toLowerCase());
    } else {
      setError("Incorrect email or password.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="w-12 h-12 bg-[#1a2d5a] rounded-xl flex items-center justify-center mx-auto mb-3">
            <Camera className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-xl text-[#1a2d5a]">TMA Studio</CardTitle>
          <p className="text-sm text-gray-500">Upload photos and clips for ads</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="tmasuwanee@gmail.com" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password" type={showPw ? "text" : "password"} value={password}
                  onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full bg-[#1a2d5a] hover:bg-[#142347]">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:<mime>;base64," prefix
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function StudioApp({ email, onLogout }: { email: string; onLogout: () => void }) {
  // 2026-06-04: tags is now an array. Defaults to single afterschool tag.
  // The first tag in the array becomes the "primary vertical" server-side.
  const [tags, setTags] = useState<Vertical[]>(["afterschool"]);
  const [caption, setCaption] = useState("");
  const [minorRelease, setMinorRelease] = useState(false);
  const [filterVertical, setFilterVertical] = useState<Vertical | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [editingAsset, setEditingAsset] = useState<any | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; progress: "queued" | "uploading" | "done" | "error"; error?: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleTag(v: Vertical) {
    setTags(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]);
  }

  const listQuery = trpc.studio.list.useQuery(
    { vertical: filterVertical === "all" ? undefined : filterVertical, limit: 200 },
    { refetchOnWindowFocus: false }
  );
  const upload = trpc.studio.upload.useMutation();
  const del = trpc.studio.delete.useMutation();
  const utils = trpc.useUtils();

  const items = listQuery.data ?? [];
  const photoCount = useMemo(() => items.filter(a => a.kind === "photo").length, [items]);
  const videoCount = useMemo(() => items.filter(a => a.kind === "video").length, [items]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    setUploadQueue(arr.map(f => ({ name: f.name, progress: "queued" })));

    if (tags.length === 0) {
      toast.error("Pick at least one tag before uploading.");
      return;
    }
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      setUploadQueue(q => q.map((row, idx) => idx === i ? { ...row, progress: "uploading" } : row));
      try {
        if (file.size > 100 * 1024 * 1024) {
          throw new Error(`Too big (${formatBytes(file.size)}, max 100MB). Trim or compress on phone first.`);
        }
        // Some iOS HEIC files report contentType="" — fall back to inferring from extension.
        const inferredType = (() => {
          if (file.type) return file.type;
          const lower = file.name.toLowerCase();
          if (lower.endsWith(".heic") || lower.endsWith(".heif")) return "image/heic";
          if (lower.endsWith(".mov")) return "video/quicktime";
          if (lower.endsWith(".mp4")) return "video/mp4";
          if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
          if (lower.endsWith(".png")) return "image/png";
          return "application/octet-stream";
        })();
        let dataBase64: string;
        try {
          dataBase64 = await fileToBase64(file);
        } catch (readErr: any) {
          // iOS Safari FileReader can fail silently for very large files. Surface this clearly.
          throw new Error(`Couldn't read file in browser (${formatBytes(file.size)}). Try a smaller file or upload one at a time.`);
        }
        await upload.mutateAsync({
          tags,
          filename: file.name,
          contentType: inferredType,
          dataBase64,
          caption: caption || undefined,
          minorReleaseOnFile: minorRelease,
          uploadedByEmail: email,
        });
        setUploadQueue(q => q.map((row, idx) => idx === i ? { ...row, progress: "done" } : row));
      } catch (err: any) {
        // Surface the real underlying error from tRPC (zod / server) instead of a generic message.
        const msg = err?.data?.zodError
          ? `Validation: ${JSON.stringify(err.data.zodError.fieldErrors)}`
          : err?.message ?? "Upload failed";
        console.error("[studio upload]", file.name, err);
        setUploadQueue(q => q.map((row, idx) => idx === i ? { ...row, progress: "error", error: msg } : row));
        toast.error(`${file.name}: ${msg}`);
      }
    }

    // Reset form bits, refresh the gallery
    setCaption("");
    setMinorRelease(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    await utils.studio.list.invalidate();
    toast.success(`Uploaded ${arr.filter((_, i) => uploadQueue[i]?.progress !== "error").length} of ${arr.length}`);
  }

  async function confirmDelete() {
    if (pendingDelete == null) return;
    try {
      await del.mutateAsync({ id: pendingDelete });
      toast.success("Deleted");
      await utils.studio.list.invalidate();
    } catch (err: any) {
      toast.error(err?.message ?? "Delete failed");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-[#1a2d5a] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Camera className="w-5 h-5" />
          <div>
            <div className="font-semibold text-sm">TMA Studio</div>
            <div className="text-xs text-blue-200">{email}</div>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-white hover:bg-white/10"
          onClick={onLogout}>
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Upload Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-[#1a2d5a]">Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs">Tags <span className="text-gray-400">(pick all that apply)</span></Label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {VERTICALS.map(v => {
                  const active = tags.includes(v.value);
                  return (
                    <button key={v.value} type="button" onClick={() => toggleTag(v.value)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                        active
                          ? "bg-[#1a2d5a] text-white border-[#1a2d5a]"
                          : "bg-white text-gray-700 border-gray-300 hover:border-[#1a2d5a]"
                      }`}>
                      {active && <Check className="w-3 h-3 inline -ml-0.5 mr-0.5" />}
                      {v.label}
                    </button>
                  );
                })}
              </div>
              {tags.length > 1 && (
                <p className="text-[10px] text-gray-400 mt-1.5">
                  Primary bucket: <strong>{VERTICALS.find(x => x.value === tags[0])?.label}</strong> (first selected)
                </p>
              )}
            </div>

            <div>
              <Label className="text-xs">Caption (optional)</Label>
              <Textarea value={caption} onChange={e => setCaption(e.target.value)}
                placeholder="e.g. Tuesday 6pm pickup, Ethan with backpack"
                className="mt-1 resize-none" rows={2} />
            </div>

            <div className="flex items-start gap-2">
              <Checkbox id="release" checked={minorRelease}
                onCheckedChange={v => setMinorRelease(v === true)} className="mt-0.5" />
              <Label htmlFor="release" className="text-xs leading-snug cursor-pointer">
                Photo release on file for any identifiable minor in this asset
              </Label>
            </div>

            <div>
              <input ref={fileInputRef} type="file" multiple
                accept="image/*,video/*"
                onChange={e => handleFiles(e.target.files)}
                className="hidden" id="file-input" />
              <Button asChild className="w-full bg-[#c41e3a] hover:bg-[#a31931] h-12">
                <label htmlFor="file-input" className="cursor-pointer flex items-center justify-center gap-2">
                  <Upload className="w-5 h-5" />
                  Choose photos or videos
                </label>
              </Button>
              <p className="text-xs text-gray-500 mt-2 text-center">
                Phone camera roll works. Max 100MB per file.
                <br />For long clips: 1080p (not 4K), under ~60 seconds.
              </p>
            </div>

            {uploadQueue.length > 0 && (
              <div className="space-y-1 pt-2 border-t">
                {uploadQueue.map((row, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="truncate flex-1 mr-2">{row.name}</span>
                    {row.progress === "queued" && <span className="text-gray-400">queued</span>}
                    {row.progress === "uploading" && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                    {row.progress === "done" && <span className="text-green-600">✓</span>}
                    {row.progress === "error" && <span className="text-red-600 truncate max-w-[180px]" title={row.error}>{row.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gallery */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-[#1a2d5a]">Library</CardTitle>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ImageIcon className="w-3.5 h-3.5" /> {photoCount}
                <Video className="w-3.5 h-3.5 ml-1" /> {videoCount}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={filterVertical} onValueChange={v => setFilterVertical(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verticals</SelectItem>
                {VERTICALS.map(v => (
                  <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {listQuery.isLoading ? (
              <div className="py-8 text-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : items.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">
                No assets yet. Upload some above.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {items.map(asset => (
                  <AssetTile key={asset.id} asset={asset}
                    onDelete={() => setPendingDelete(asset.id)}
                    onEdit={() => setEditingAsset(asset)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <EditTagsModal asset={editingAsset} onClose={() => setEditingAsset(null)}
        onSaved={() => utils.studio.list.invalidate()} />

      <AlertDialog open={pendingDelete != null} onOpenChange={() => setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the file from storage and the library. Can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function parseTags(asset: any): Vertical[] {
  // 2026-06-04: tags column is JSON text. Fall back to single-vertical for legacy rows.
  if (asset.tags) {
    try {
      const parsed = JSON.parse(asset.tags);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Vertical[];
    } catch { /* fall through */ }
  }
  return asset.vertical ? [asset.vertical] : [];
}

function AssetTile({ asset, onDelete, onEdit }: { asset: any; onDelete: () => void; onEdit: () => void }) {
  const urlQuery = trpc.studio.getDownloadUrl.useQuery({ id: asset.id }, {
    staleTime: 60 * 1000, refetchOnWindowFocus: false,
  });
  const url = urlQuery.data?.url;
  const assetTags = parseTags(asset);

  return (
    <div className="relative bg-gray-100 rounded overflow-hidden aspect-square group">
      {url ? (
        asset.kind === "photo" ? (
          <img src={url} alt={asset.originalName} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <video src={url} className="w-full h-full object-cover" muted playsInline />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          {asset.kind === "photo" ? <ImageIcon className="w-6 h-6" /> : <Video className="w-6 h-6" />}
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-2">
        <div className="text-white text-[10px] truncate">{asset.originalName}</div>
        <div className="flex items-center flex-wrap gap-1 mt-0.5">
          {assetTags.map(t => (
            <Badge key={t} variant="outline" className="text-[9px] py-0 px-1 bg-white/20 text-white border-white/30">
              {t}
            </Badge>
          ))}
          <span className="text-[9px] text-white/70">{formatBytes(asset.sizeBytes)}</span>
        </div>
      </div>

      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Edit tags"
          className="p-1 bg-black/50 rounded text-white">
          <Tag className="w-3 h-3" />
        </button>
        <button onClick={onDelete} title="Delete"
          className="p-1 bg-black/50 rounded text-white">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Always-visible tap zone for mobile (no hover) */}
      <button onClick={onEdit}
        className="md:hidden absolute top-1 right-1 p-1.5 bg-black/60 rounded text-white">
        <Tag className="w-3.5 h-3.5" />
      </button>

      {!asset.minorReleaseOnFile && (
        <div className="absolute top-1 left-1 px-1 py-0.5 bg-yellow-500/90 text-[8px] text-white rounded font-semibold">
          NO RELEASE
        </div>
      )}
    </div>
  );
}

function EditTagsModal({ asset, onClose, onSaved }: {
  asset: any | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Vertical[]>([]);
  const setTagsMutation = trpc.studio.setTags.useMutation();

  // Re-seed when a new asset opens
  useEffect(() => {
    if (asset) setSelected(parseTags(asset));
  }, [asset?.id]);

  if (!asset) return null;

  function toggle(v: Vertical) {
    setSelected(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v]);
  }

  async function save() {
    if (selected.length === 0) {
      toast.error("Pick at least one tag.");
      return;
    }
    try {
      await setTagsMutation.mutateAsync({ id: asset.id, tags: selected });
      toast.success("Tags updated");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save tags");
    }
  }

  return (
    <Dialog open={!!asset} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Edit tags</DialogTitle>
          <DialogDescription className="text-xs">
            {asset.originalName}. First tag becomes the primary bucket.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-1.5 py-2">
          {VERTICALS.map(v => {
            const active = selected.includes(v.value);
            return (
              <button key={v.value} type="button" onClick={() => toggle(v.value)}
                className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${
                  active
                    ? "bg-[#1a2d5a] text-white border-[#1a2d5a]"
                    : "bg-white text-gray-700 border-gray-300 hover:border-[#1a2d5a]"
                }`}>
                {active && <Check className="w-3 h-3 inline -ml-0.5 mr-0.5" />}
                {v.label}
              </button>
            );
          })}
        </div>
        {selected.length > 1 && (
          <p className="text-[11px] text-gray-500">
            Primary bucket: <strong>{VERTICALS.find(x => x.value === selected[0])?.label}</strong>
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs">Cancel</Button>
          <Button onClick={save} disabled={setTagsMutation.isPending}
            className="bg-[#1a2d5a] hover:bg-[#142347] text-xs">
            {setTagsMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Studio() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) setEmail(saved);
  }, []);

  if (!email) return <LoginGate onLogin={setEmail} />;
  return <StudioApp email={email} onLogout={() => {
    sessionStorage.removeItem(SESSION_KEY);
    setEmail(null);
  }} />;
}
