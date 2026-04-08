import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Testimonial {
  id: string;
  twitter_handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  testimonial_text: string;
  role_label: string | null;
}

interface TestimonialCarouselProps {
  className?: string;
  autoRotateMs?: number;
  maxVisible?: number;
}

export function TestimonialCarousel({ 
  className, 
  autoRotateMs = 6000,
  maxVisible = 20 
}: TestimonialCarouselProps) {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right'>('right');

  useEffect(() => {
    supabase
      .from('testimonials')
      .select('id, twitter_handle, display_name, avatar_url, testimonial_text, role_label')
      .eq('is_approved', true)
      .order('sort_order', { ascending: true })
      .limit(maxVisible)
      .then(({ data }) => {
        if (data && data.length > 0) setTestimonials(data);
      });
  }, [maxVisible]);

  const next = useCallback(() => {
    setDirection('right');
    setCurrent(c => (c + 1) % testimonials.length);
  }, [testimonials.length]);

  const prev = useCallback(() => {
    setDirection('left');
    setCurrent(c => (c - 1 + testimonials.length) % testimonials.length);
  }, [testimonials.length]);

  useEffect(() => {
    if (testimonials.length <= 1 || isPaused) return;
    const timer = setInterval(next, autoRotateMs);
    return () => clearInterval(timer);
  }, [testimonials.length, isPaused, autoRotateMs, next]);

  if (testimonials.length === 0) return null;

  const t = testimonials[current];

  return (
    <div 
      className={cn("relative w-full", className)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="relative overflow-hidden rounded-lg border border-[hsl(270_30%_35%)] bg-gradient-to-br from-[hsl(270_25%_18%)] to-[hsl(280_20%_14%)] shadow-[0_4px_20px_hsl(270_30%_15%/0.5)] backdrop-blur-sm px-6 py-5 md:px-8 md:py-6">
        {/* Quote icon */}
        <Quote className="absolute top-3 left-3 h-5 w-5 text-primary/20" />

        {/* Content */}
        <div className="flex items-start gap-4 min-h-[80px]">
          {/* Avatar */}
          <div className="shrink-0">
            {t.avatar_url ? (
              <img 
                src={t.avatar_url} 
                alt={t.display_name || t.twitter_handle || 'User'} 
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
                className="w-10 h-10 md:w-12 md:h-12 rounded-full border-2 border-primary/20 object-cover"
              />
            ) : (
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                {(t.display_name || t.twitter_handle || '?')[0]?.toUpperCase()}
              </div>
            )}
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <p className="text-sm md:text-base text-foreground leading-relaxed italic">
              "{t.testimonial_text}"
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">
                {t.display_name || t.twitter_handle}
              </span>
              {t.twitter_handle && (
                <a 
                  href={`https://x.com/${t.twitter_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  @{t.twitter_handle}
                </a>
              )}
              {t.role_label && (
                <span className="text-xs text-muted-foreground">· {t.role_label}</span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation arrows */}
        {testimonials.length > 1 && (
          <>
            <button 
              onClick={prev}
              className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/50 hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={next}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-background/50 hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Next testimonial"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}

        {/* Dots */}
        {testimonials.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-3">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => { setDirection(i > current ? 'right' : 'left'); setCurrent(i); }}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all duration-300",
                  i === current ? "bg-primary w-4" : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to testimonial ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
