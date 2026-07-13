import React, { useState } from 'react';
import { Task } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { cn } from '../lib/utils';
import { Calendar, User, CheckCircle2, Circle, Clock, MessageSquare, Paperclip } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface TaskWithProject extends Task {
  projects?: {
    name: string;
  };
}

interface KanbanBoardProps {
  tasks: TaskWithProject[];
  onStatusChange: (task: TaskWithProject, newStatus: Task['status']) => void;
  onTaskClick?: (task: TaskWithProject) => void;
}

interface SortableTaskCardProps {
  task: TaskWithProject;
  onClick?: (task: TaskWithProject) => void;
}

const SortableTaskCard: React.FC<SortableTaskCardProps> = ({ task, onClick }) => {
  const { translateData } = useLanguage();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className="bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-white/10 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 dark:border-slate-800 hover:shadow-xl transition-all group cursor-grab active:cursor-grabbing hover:-translate-y-1 active:scale-95"
    >
      <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100 dark:text-slate-100 mb-1 group-hover:text-indigo-600 transition-colors">{translateData(task.title)}</h4>
      {task.projects?.name && (
        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter mb-3 bg-indigo-50 w-fit px-2 py-0.5 rounded-full">
          {translateData(task.projects.name)}
        </p>
      )}
      
      <div className="flex flex-wrap gap-3 mt-3">
        {task.assigned_to && (
          <div className="flex items-center gap-1.5">
            <Avatar className="w-5 h-5 border-2 border-white dark:border-[#121212] shadow-sm">
              <AvatarFallback className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold text-[8px]">
                {task.assigned_to.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {translateData(task.assigned_to)}
            </span>
          </div>
        )}
        
        {(task.comment || task.attachment_url) && (
          <div className="flex items-center gap-2.5 text-slate-400 ml-auto mr-1">
            {task.comment && (
              <div className="flex items-center gap-1" title="Has comment">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">1</span>
              </div>
            )}
            {task.attachment_url && (
              <div className="flex items-center gap-1" title="Has attachment">
                <Paperclip className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">1</span>
              </div>
            )}
          </div>
        )}

        {task.deadline && (
          <div className={cn("flex items-center gap-1.5", (task.comment || task.attachment_url) ? "" : "ml-auto")}>
            <Calendar className="w-3 h-3 text-slate-400" />
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              new Date(task.deadline) < new Date() && task.status !== 'Completed' 
                ? "text-red-500" 
                : "text-slate-400"
            )}>
              {isValid(parseISO(task.deadline)) ? format(parseISO(task.deadline), 'MMM d') : 'N/A'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const DroppableColumn = ({ id, children, className }: { id: string, children: React.ReactNode, className?: string }) => {
  const { setNodeRef } = useDroppable({
    id,
  });
  return <div ref={setNodeRef} className={className}>{children}</div>;
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, onStatusChange, onTaskClick }) => {
  const { translateData } = useLanguage();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const columns: { title: string; status: Task['status']; icon: any; color: string }[] = [
    { title: 'To Do', status: 'Todo', icon: Circle, color: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400' },
    { title: 'In Progress', status: 'In Progress', icon: Clock, color: 'bg-indigo-50 text-indigo-600' },
    { title: 'Completed', status: 'Completed', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' }
  ];

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    const activeTask = tasks.find(t => t.id === activeId);
    if (!activeTask) return;

    let newStatus: Task['status'] = activeTask.status;

    if (['Todo', 'In Progress', 'Completed'].includes(overId as string)) {
      newStatus = overId as Task['status'];
    } else {
      const overTask = tasks.find(t => t.id === overId);
      if (overTask) {
        newStatus = overTask.status;
      }
    }

    if (activeTask.status !== newStatus) {
      onStatusChange(activeTask, newStatus);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-6 h-full min-h-[600px] overflow-x-auto pb-8 snap-x no-scrollbar">
        {columns.map((column) => (
          <div key={column.status} className="flex flex-col gap-4 w-80 min-w-[300px] sm:min-w-[340px] snap-center">
            <div 
              className={cn(
                "flex items-center justify-between p-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-sm",
                column.color
              )}
            >
              <div className="flex items-center gap-2.5">
                <column.icon className="w-4 h-4" />
                {translateData(column.title)}
              </div>
              <span className="bg-white dark:bg-slate-900/40 px-2.5 py-0.5 rounded-full text-[10px]">
                {tasks.filter(t => t.status === column.status).length}
              </span>
            </div>

            <SortableContext
              id={column.status}
              items={tasks.filter(t => t.status === column.status).map(t => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <DroppableColumn id={column.status} className="flex-1 bg-slate-50 dark:bg-[#0a0a0a] dark:bg-slate-950 dark:border-slate-800/40 rounded-[32px] p-4 space-y-4 border border-slate-100 dark:border-slate-800/50 backdrop-blur-sm">
                {tasks.filter(t => t.status === column.status).map((task) => (
                  <SortableTaskCard key={task.id} task={task} onClick={onTaskClick} />
                ))}
                {tasks.filter(t => t.status === column.status).length === 0 && (
                  <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900/30 pointer-events-none">
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Drop tasks here</p>
                  </div>
                )}
              </DroppableColumn>
            </SortableContext>
          </div>
        ))}
      </div>

      <DragOverlay>
        {activeId ? (
          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-xl border-2 border-indigo-500 scale-105 rotate-2">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {translateData(tasks.find(t => t.id === activeId)?.title || '')}
            </h4>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
