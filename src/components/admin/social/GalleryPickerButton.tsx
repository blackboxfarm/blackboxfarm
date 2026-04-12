import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ImageIcon } from "lucide-react";
import { ImageGallery } from "./ImageGallery";

interface GalleryPickerButtonProps {
  onSelect: (imageUrl: string) => void;
  currentUrl?: string;
  label?: string;
  articleContent?: string;
  articleTitle?: string;
}

export function GalleryPickerButton({ onSelect, currentUrl, label = "Gallery", articleContent, articleTitle }: GalleryPickerButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
        <ImageIcon className="h-3.5 w-3.5" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Image from Gallery</DialogTitle>
          </DialogHeader>
          <ImageGallery
            mode="pick"
            articleContent={articleContent}
            articleTitle={articleTitle}
            onSelect={(url) => {
              onSelect(url);
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
