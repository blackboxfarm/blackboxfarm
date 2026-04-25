import React, { useState } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Publication {
  id: string;
  briefing_id: string;
  platform: string;
  content_depth: number;
  published_url: string | null;
  notes: string | null;
  published_at: string;
  briefing_title?: string;
  is_breadcrumb?: boolean;
}

interface CalendarViewProps {
  publications: Publication[];
  mode: 'month' | 'week';
}

const depthColor = (depth: number) => {
  if (depth >= 100) return 'bg-green-500';
  if (depth >= 75) return 'bg-blue-500';
  if (depth >= 50) return 'bg-amber-500';
  return 'bg-red-500';
};

const depthBorder = (depth: number) => {
  if (depth >= 100) return 'border-green-500/30';
  if (depth >= 75) return 'border-blue-500/30';
  if (depth >= 50) return 'border-amber-500/30';
  return 'border-red-500/30';
};

const DayCell = ({ day, pubs, currentMonth, isWeek }: { day: Date; pubs: Publication[]; currentMonth: Date; isWeek: boolean }) => {
  const isCurrentMonth = isSameMonth(day, currentMonth);
  const isToday = isSameDay(day, new Date());

  return (
    <div className={cn(
      'border border-border rounded p-1 min-h-[80px]',
      isWeek && 'min-h-[120px]',
      !isCurrentMonth && 'opacity-40',
      isToday && 'border-primary/50 bg-primary/5'
    )}>
      <div className={cn('text-xs font-medium mb-1', isToday ? 'text-primary' : 'text-muted-foreground')}>
        {format(day, 'd')}
      </div>
      <div className="flex flex-wrap gap-0.5">
        {pubs.map(pub => (
          <Popover key={pub.id}>
            <PopoverTrigger asChild>
              <button className={cn('w-2.5 h-2.5 rounded-full cursor-pointer hover:ring-2 hover:ring-primary/50', depthColor(pub.content_depth))} />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 text-xs space-y-1">
              <p className="font-semibold text-foreground">{pub.briefing_title || 'Article'}</p>
              <p className="text-muted-foreground">
                {pub.platform} · {pub.is_breadcrumb ? '🔗 Breadcrumb' : `${pub.content_depth}%`}
              </p>
              {pub.notes && <p className="text-muted-foreground italic">{pub.notes}</p>}
              {pub.published_url && (
                <a href={pub.published_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline block truncate">{pub.published_url}</a>
              )}
            </PopoverContent>
          </Popover>
        ))}
      </div>
      {isWeek && pubs.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {pubs.slice(0, 3).map(pub => (
            <div key={pub.id} className={cn('text-[10px] leading-tight truncate border-l-2 pl-1', depthBorder(pub.content_depth))}>
              <span className="text-foreground">{pub.briefing_title?.slice(0, 25)}</span>
              <span className="text-muted-foreground"> · {pub.platform}</span>
            </div>
          ))}
          {pubs.length > 3 && <div className="text-[10px] text-muted-foreground">+{pubs.length - 3} more</div>}
        </div>
      )}
    </div>
  );
};

export const CalendarView = ({ publications, mode }: CalendarViewProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const days = mode === 'month'
    ? eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(monthEnd) })
    : eachDayOfInterval({ start: startOfWeek(currentMonth), end: endOfWeek(currentMonth) });

  const pubsByDay = (day: Date) =>
    publications.filter(p => isSameDay(new Date(p.published_at), day));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold text-foreground">{format(currentMonth, 'MMMM yyyy')}</h3>
        <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
          <div key={d} className="text-[10px] text-center text-muted-foreground font-medium py-1">{d}</div>
        ))}
        {days.map(day => (
          <DayCell key={day.toISOString()} day={day} pubs={pubsByDay(day)} currentMonth={currentMonth} isWeek={mode === 'week'} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground justify-center pt-2">
        {[
          { label: '100%', color: 'bg-green-500' },
          { label: '75%', color: 'bg-blue-500' },
          { label: '50%', color: 'bg-amber-500' },
          { label: '25%', color: 'bg-red-500' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={cn('w-2.5 h-2.5 rounded-full', l.color)} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
