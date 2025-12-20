import { Loader2 } from "lucide-react";

export const LazyLoader = () => (
  <div className="flex items-center justify-center p-8 min-h-[200px]">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

export const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
      <p className="text-muted-foreground">Loading...</p>
    </div>
  </div>
);
