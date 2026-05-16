import React, { useEffect } from "react";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { TokenArchive as TokenArchiveView } from "@/components/admin/holders-intel/TokenArchive";

export default function TokenArchivePage() {
  useEffect(() => {
    document.title = "Token Archive — HoldersIntel Posts | BlackBox Farm";
    const desc =
      "Archive of every @HoldersIntel token post. Search by mint or name, paginate the full history, and jump back to the original X post.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  return (
    <SiteLayout>
      <div className="container mx-auto px-4 py-6 space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl md:text-3xl font-bold">Token Archive</h1>
          <p className="text-sm text-muted-foreground">
            Every @HoldersIntel post we've composed — newest first. Search by mint, name, or symbol.
          </p>
        </header>
        <TokenArchiveView />
      </div>
    </SiteLayout>
  );
}
