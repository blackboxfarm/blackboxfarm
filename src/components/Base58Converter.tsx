import React, { useMemo, useState } from "react";
import bs58 from "bs58";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const prettyJson = (arr: number[]) => JSON.stringify(arr);

const Base58Converter: React.FC = () => {
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [bytes, setBytes] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lengthInfo = useMemo(() => {
    if (!bytes) return "";
    const len = bytes.length;
    return `${len} byte${len === 1 ? "" : "s"}`;
  }, [bytes]);

  const handleConvert = () => {
    setError(null);
    try {
      const decoded = bs58.decode(input.trim());
      const arr = Array.from(decoded);
      setBytes(arr);
      toast({ title: "Conversion successful", description: `Decoded ${arr.length} bytes.` });
    } catch (e: any) {
      setBytes(null);
      const msg = e?.message || "Invalid Base58 string";
      setError(msg);
      toast({ title: "Conversion failed", description: msg, variant: "destructive" });
    }
  };

  const handleClear = () => {
    setInput("");
    setBytes(null);
    setError(null);
  };

  const handleCopy = async () => {
    if (!bytes) return;
    try {
      await navigator.clipboard.writeText(prettyJson(bytes));
      toast({ title: "Copied", description: "JSON array copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Could not access clipboard.", variant: "destructive" });
    }
  };

  return (
    <section aria-labelledby="b58-converter">
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle id="b58-converter">Base58 → JSON Array Converter</CardTitle>
          <CardDescription>
            Paste your Base58 secret or key. We decode locally in your browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="b58-input">Base58 input</Label>
            <Textarea
              id="b58-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste Base58 string here"
              className="min-h-[96px]"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleConvert} disabled={!input.trim()}>Convert</Button>
            <Button variant="secondary" onClick={handleClear} disabled={!input}>Clear</Button>
            <Button variant="outline" onClick={handleCopy} disabled={!bytes}>Copy JSON</Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              {bytes ? (
                <>
                  Length: {lengthInfo} {bytes.length !== 64 && (
                    <span className="ml-1">(Solana secret keys are typically 64 bytes)</span>
                  )}
                </>
              ) : error ? (
                <span role="alert">{error}</span>
              ) : (
                <span>Output will appear here after converting.</span>
              )}
            </div>
            <Textarea
              readOnly
              value={bytes ? prettyJson(bytes) : ""}
              placeholder="[ ... JSON array ... ]"
              className="min-h-[96px] font-mono text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
};

export default Base58Converter;
