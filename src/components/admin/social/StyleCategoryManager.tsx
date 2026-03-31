import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, GripVertical } from "lucide-react";
import type { StyleCategory } from "./ImageGallery";

interface Props {
  categories: StyleCategory[];
  onUpdate: () => void;
}

export function StyleCategoryManager({ categories, onUpdate }: Props) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#f97316");
  const [newDesc, setNewDesc] = useState("");

  const addCategory = async () => {
    if (!newName.trim()) { toast.error("Name required"); return; }
    await (supabase as any).from('gallery_style_categories').insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      color: newColor,
      sort_order: categories.length + 1,
    });
    toast.success(`Category "${newName}" added`);
    setNewName(""); setNewDesc(""); setNewColor("#f97316");
    onUpdate();
  };

  const deleteCategory = async (id: string) => {
    await (supabase as any).from('gallery_style_categories').update({ is_active: false }).eq('id', id);
    toast.success('Category removed');
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 border rounded-lg p-2">
            <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{cat.name}</p>
              {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
            </div>
            <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => deleteCategory(cat.id)}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t pt-3 space-y-2">
        <Label className="text-xs font-semibold">Add New Category</Label>
        <div className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name" className="text-sm" />
          </div>
          <div className="space-y-1">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
          </div>
          <Button size="sm" onClick={addCategory} disabled={!newName.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        </div>
        <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional description" className="text-sm" />
      </div>
    </div>
  );
}
