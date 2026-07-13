import React, { useState } from 'react';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { 
  ChevronLeft, 
  ChevronRight, 
  User, 
  CheckCircle2, 
  Circle, 
  Clock 
} from 'lucide-react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  isSameMonth, 
  isSameDay, 
  addDays, 
  parseISO,
  isValid
} from 'date-fns';

interface CalendarEvent {
  id: string;
  title: string;
  date: string | null;
  status?: string;
  type: 'task' | 'project';
  project_name?: string;
}

interface CalendarViewProps {
  events: CalendarEvent[];
  onEventClick?: (event: CalendarEvent) => void;
  selectedProjectName?: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ events, onEventClick, selectedProjectName }) => {
  const { t } = useLanguage();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(new Date());

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const renderHeader = () => {
    return (
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100 uppercase tracking-widest">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <button 
            onClick={prevMonth}
            className="p-2 hover:bg-slate-100 dark:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-indigo-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button 
            onClick={nextMonth}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all text-slate-400 hover:text-indigo-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const renderDays = () => {
    const days = [];
    const date = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      days.push(
        <div key={i} className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest py-2">
          {date[i]}
        </div>
      );
    }
    return <div className="grid grid-cols-7 mb-2">{days}</div>;
  };

  const renderCells = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        
        const dayEvents = events.filter(event => {
          if (!event.date) return false;
          const eventDate = parseISO(event.date);
          return isValid(eventDate) && isSameDay(eventDate, cloneDay);
        });

        days.push(
          <div
            key={day.toString()}
            onClick={() => setSelectedDay(cloneDay)}
            className={cn(
              "min-h-[120px] p-2 border border-slate-100 dark:border-white/10 transition-all cursor-pointer",
              !isSameMonth(day, monthStart) ? "bg-slate-50 dark:bg-[#181818] dark:border-white/5 text-slate-300" : "bg-white dark:bg-[#121212] text-slate-900 dark:text-zinc-100",
              isSameDay(day, new Date()) && "bg-indigo-50/30 dark:bg-indigo-500/10 border-indigo-100 dark:border-indigo-500/20",
              isSameDay(day, selectedDay) && "ring-2 ring-indigo-500 ring-inset z-10"
            )}
          >
            <span className={cn(
              "text-xs font-bold",
              isSameDay(day, new Date()) ? "text-indigo-600 dark:text-indigo-400" : ""
            )}>{formattedDate}</span>
            
            <div className="mt-2 space-y-1">
              {dayEvents.map(event => (
                <div 
                  key={`${event.type}-${event.id}`} 
                  onClick={(e) => {
                    e.stopPropagation();
                    onEventClick?.(event);
                  }}
                  className={cn(
                    "text-[9px] font-bold p-1 rounded-md truncate border cursor-pointer hover:brightness-95 transition-all text-left",
                    event.type === 'project'
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20"
                      : event.status === 'Completed' 
                        ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-500/20" 
                        : "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-500/20"
                  )}
                  title={`${event.type.toUpperCase()}: ${event.title}${event.project_name ? ` (${event.project_name})` : ''}`}
                >
                  <span className="opacity-50 mr-1">
                    {event.type === 'project' ? 'P:' : 'T:'}
                  </span>
                  {event.title}
                </div>
              ))}
            </div>
          </div>
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return <div className="rounded-2xl overflow-hidden border border-slate-100 dark:border-white/10 shadow-sm">{rows}</div>;
  };

  const renderRightPanel = () => {
    const today = new Date();
    
    const todayEvents = events.filter(e => e.date && isSameDay(parseISO(e.date), today));
    const upcomingEvents = events.filter(e => {
      if (!e.date) return false;
      const d = parseISO(e.date);
      return d > today && !isSameDay(d, today);
    }).sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime()).slice(0, 5);

    const projectEvents = selectedProjectName && selectedProjectName !== 'all'
      ? events.filter(e => e.project_name === selectedProjectName)
      : [];

    const selectedDayEvents = events.filter(event => {
      if (!event.date) return false;
      const eventDate = parseISO(event.date);
      return isValid(eventDate) && isSameDay(eventDate, selectedDay);
    });

    const Section = ({ title, items, emptyMsg }: { title: string, items: CalendarEvent[], emptyMsg: string }) => (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
          <Badge variant="secondary" className="bg-white dark:bg-[#181818] text-indigo-600 dark:text-indigo-400 font-bold text-[10px] border dark:border-white/10">
            {items.length}
          </Badge>
        </div>
        {items.length === 0 ? (
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 italic py-3 text-center bg-white dark:bg-[#181818] rounded-xl border border-dashed border-slate-200 dark:border-white/10">
            {emptyMsg}
          </p>
        ) : (
          <div className="space-y-2">
            {items.map(event => (
              <div 
                key={`${event.type}-${event.id}`}
                onClick={() => onEventClick?.(event)}
                className={cn(
                  "p-3 rounded-xl border bg-white dark:bg-[#181818] shadow-sm hover:shadow-md transition-all cursor-pointer group",
                  event.type === 'project' ? "border-amber-100 dark:border-amber-500/20" : "border-indigo-100 dark:border-indigo-500/20"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <Badge className={cn(
                    "text-[7px] font-black uppercase tracking-tighter px-1 py-0",
                    event.type === 'project' ? "bg-amber-500 text-white" : "bg-indigo-500 text-white"
                  )}>
                    {event.type}
                  </Badge>
                  <span className="text-[8px] font-bold text-slate-400 dark:text-zinc-500">
                    {event.date ? format(parseISO(event.date), 'MMM d') : ''}
                  </span>
                </div>
                <h5 className="text-xs font-bold text-slate-900 dark:text-zinc-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors line-clamp-1">{event.title}</h5>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    return (
      <div className="bg-slate-50 dark:bg-[#121212] rounded-3xl p-6 border border-slate-100 dark:border-white/10 h-full flex flex-col gap-8 overflow-y-auto max-h-[800px] no-scrollbar">
        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-900 dark:text-zinc-100 uppercase tracking-widest">
            {format(selectedDay, 'MMMM d, yyyy')}
          </h3>
          <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">Selected Date Overview</p>
        </div>

        <Section 
          title="Selected Day" 
          items={selectedDayEvents} 
          emptyMsg="No events for this day" 
        />

        <Separator className="bg-slate-200/50" />

        <Section 
          title="Today's Tasks" 
          items={todayEvents} 
          emptyMsg="No tasks for today" 
        />

        <Section 
          title="Upcoming" 
          items={upcomingEvents} 
          emptyMsg="No upcoming tasks" 
        />

        {selectedProjectName && selectedProjectName !== 'all' && (
          <Section 
            title={`Tasks in ${selectedProjectName}`} 
            items={projectEvents} 
            emptyMsg="No tasks in this project" 
          />
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      <div className="flex-1 bg-white dark:bg-[#121212] rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-100 dark:border-white/10">
        {renderHeader()}
        {renderDays()}
        {renderCells()}
      </div>
      <div className="w-full lg:w-96 shrink-0">
        {renderRightPanel()}
      </div>
    </div>
  );
};
