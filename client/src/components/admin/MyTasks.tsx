import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, Check, CheckSquare } from "lucide-react";

// Arfa's personal punch list. Add a task, check it off, jot notes, optional due
// date. Shared backend so anything we add as we build can show up here too.
export default function MyTasks() {
  const utils = trpc.useUtils();
  const list = trpc.tasks.list.useQuery();
  const refresh = () => utils.tasks.list.invalidate();
  const add = trpc.tasks.add.useMutation({ onSuccess: refresh });
  const update = trpc.tasks.update.useMutation({ onSuccess: refresh });
  const del = trpc.tasks.delete.useMutation({ onSuccess: refresh });

  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);

  const tasks = (list.data ?? []) as any[];
  const open = tasks.filter(t => !t.done);
  const done = tasks.filter(t => t.done);

  const submit = () => {
    if (!title.trim()) return;
    add.mutate({ title: title.trim(), dueDate: due || null });
    setTitle(""); setDue("");
  };

  const Row = (t: any) => (
    <div key={t.id} className="bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center gap-2.5 p-3">
        <button onClick={() => update.mutate({ id: t.id, done: !t.done })}
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
            t.done ? "bg-green-600 border-green-600" : "border-gray-300 hover:border-[#1a2d5a]"}`}>
          {t.done ? <Check className="w-3 h-3 text-white" /> : null}
        </button>
        <button onClick={() => setOpenId(openId === t.id ? null : t.id)} className="flex-1 text-left min-w-0">
          <span className={`text-sm ${t.done ? "line-through text-gray-400" : "text-gray-800"}`}>{t.title}</span>
          {t.dueDate ? <span className="ml-2 text-[10px] text-gray-400">due {t.dueDate}</span> : null}
          {t.notes && openId !== t.id ? <span className="ml-2 text-[10px] text-gray-300">has notes</span> : null}
        </button>
        <button onClick={() => del.mutate({ id: t.id })} className="text-gray-300 hover:text-red-500 shrink-0" title="Delete">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      {openId === t.id ? (
        <div className="px-3 pb-3">
          <Textarea defaultValue={t.notes ?? ""} placeholder="Notes..." className="text-sm min-h-[60px]"
            onBlur={e => { if (e.target.value !== (t.notes ?? "")) update.mutate({ id: t.id, notes: e.target.value }); }} />
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Add a task..."
              className="flex-1 min-w-[180px]" onKeyDown={e => { if (e.key === "Enter") submit(); }} />
            <Input type="date" value={due} onChange={e => setDue(e.target.value)} className="w-auto text-sm" />
            <Button onClick={submit} disabled={!title.trim() || add.isPending} className="bg-[#1a2d5a] hover:bg-[#142347] shrink-0">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {list.isLoading ? (
        <div className="text-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : (
        <>
          <div className="space-y-2">
            {open.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm bg-white rounded border border-dashed">
                <CheckSquare className="w-5 h-5 mx-auto mb-1 opacity-50" /> No open tasks. Add one above.
              </div>
            ) : open.map(Row)}
          </div>
          {done.length > 0 ? (
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-gray-400 mt-4 mb-2">Done ({done.length})</h3>
              <div className="space-y-2 opacity-70">{done.map(Row)}</div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
