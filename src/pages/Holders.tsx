import React from "react";
import { BaglessHoldersReport } from "@/components/BaglessHoldersReport";

export default function Holders() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Token Holders Report</h1>
          <p className="text-muted-foreground">
            Analyze token holder distribution and wallet categories
          </p>
        </div>
        
        <BaglessHoldersReport />
      </div>
    </div>
  );
}