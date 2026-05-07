import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { supabaseThumb } from '@/lib/supabaseImage';

interface BriefingCardProps {
  slug: string;
  title: string;
  subtitle?: string | null;
  category: string;
  featured_image_url?: string | null;
  published_at: string;
  tags?: string[] | null;
}

const CATEGORY_COLORS: Record<string, string> = {
  'holder-analysis': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'wallet-tracing': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'scam-detection': 'bg-red-500/20 text-red-400 border-red-500/30',
  'platform-guides': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'market-intel': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'general': 'bg-muted text-muted-foreground border-border',
};

export function BriefingCard({ slug, title, subtitle, category, featured_image_url, published_at, tags }: BriefingCardProps) {
  const colorClass = CATEGORY_COLORS[category] || CATEGORY_COLORS.general;

  return (
    <Link
      to={`/intel/briefing/${slug}`}
      className="group block rounded-xl border border-border bg-card hover:border-primary/40 transition-all duration-300 overflow-hidden hover:shadow-lg hover:shadow-primary/5"
    >
      {featured_image_url && (
        <div className="aspect-video overflow-hidden bg-black/40 flex items-center justify-center">
          <img
            src={supabaseThumb(featured_image_url, { width: 600, height: 338, resize: 'contain', quality: 70 })}
            alt={title}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${colorClass}`}>
            {category.replace(/-/g, ' ')}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {format(new Date(published_at), 'MMM d, yyyy')}
          </span>
        </div>
        <h3 className="font-semibold text-lg leading-tight group-hover:text-primary transition-colors line-clamp-2">
          {title}
        </h3>
        {subtitle && (
          <p className="text-sm text-muted-foreground line-clamp-2">{subtitle}</p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
