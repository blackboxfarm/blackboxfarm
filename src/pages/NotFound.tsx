import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const existentialQuips = [
  "Your portfolio is down 99%. This page is down 100%.",
  "In the grand ledger of life, this route was never minted.",
  "You searched for meaning. You found a 404.",
  "Sartre said 'Hell is other people.' He never tried finding liquidity on a dead route.",
  "The real rug pull was the pages we lost along the way.",
  "If a page doesn't exist and no one is around to see it… did you still lose money?",
  "Nietzsche stared into the abyss. The abyss returned a 404.",
  "This page went to zero faster than your last memecoin.",
  "Buy the dip? There is no dip. There is no page. There is only void.",
  "You HODL'd this URL too long. It's worthless now.",
];

const NotFound = () => {
  const location = useLocation();
  const [quip] = useState(() => existentialQuips[Math.floor(Math.random() * existentialQuips.length)]);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-[#0b0a1a] relative overflow-hidden flex items-center justify-center">
      {/* Background image with overlay */}
      <div className="absolute inset-0 flex items-start justify-center">
        <img
          src="/images/404-rekt.png"
          alt="Trader in despair"
          className="w-[60%] h-[60%] object-cover object-top opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0a1a] via-[#0b0a1a]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0b0a1a]/70 via-transparent to-[#0b0a1a]/70" />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-2xl mx-auto space-y-6">
        {/* Glitchy 404 */}
        <div className="relative">
          <h1 className="text-[10rem] md:text-[14rem] font-black leading-none tracking-tighter bg-gradient-to-b from-red-400 via-red-500 to-red-900 bg-clip-text text-transparent opacity-90 select-none">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs md:text-sm font-mono text-red-400/80 bg-red-950/60 px-3 py-1 rounded-full border border-red-800/40 backdrop-blur-sm animate-pulse">
              ▼ -100.00%
            </span>
          </div>
        </div>

        {/* Existential quip */}
        <p className="text-lg md:text-xl text-purple-200/90 font-medium italic max-w-lg mx-auto leading-relaxed">
          "{quip}"
        </p>

        {/* Sub text */}
        <p className="text-sm text-muted-foreground font-mono">
          Route <code className="text-red-400 bg-red-950/40 px-2 py-0.5 rounded">{location.pathname}</code> has been rugged.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Button asChild variant="default" size="lg" className="gap-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to Safety
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="gap-2 border-purple-700/50 text-purple-300 hover:bg-purple-900/30"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4" />
            Try Again (it won't help)
          </Button>
        </div>

        {/* Tiny footer joke */}
        <p className="text-xs text-muted-foreground/50 pt-8 font-mono">
          This is not financial advice. This is not even a page.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
