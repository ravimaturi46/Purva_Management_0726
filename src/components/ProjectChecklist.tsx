import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { CheckCircle2, Circle, Plus, Loader2, Trash2, User as UserIcon, Clock, RotateCcw, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { DESIGN_ITEMS, OBSERVATION_ITEMS, STONE_CONSTRUCTION_ITEMS, CEMENT_CONSTRUCTION_ITEMS } from '../lib/checklistTemplates';
import { Project, Comment, AuditLog, PaymentStage, Task, hasProjectManagementAccess, hasAdminAccess, hasFinanceAccess, isLimitedUser } from '../types';
import { toast } from 'sonner';
import { useUser } from '../contexts/UserContext';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from './ui/dialog';
import { ConfirmDialog } from './ConfirmDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { useTheme } from '../contexts/ThemeContext';

interface ProjectChecklistProps {
  projectId: string;
  onUpdate?: () => void;
}

interface ChecklistItem {
  id: string;
  project_id: string;
  stage: string;
  category: string;
  task_name: string;
  is_completed: boolean;
  order_index: number;
  target_date?: string;
  entry_date?: string;
}

interface ItemAudit {
  user_name: string;
  created_at: string;
}

export const ProjectChecklist: React.FC<ProjectChecklistProps> = ({ projectId, onUpdate }) => {
  const { user } = useUser();
  const { getDashboardColors } = useTheme();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [itemAudits, setItemAudits] = useState<Record<string, ItemAudit>>({});
  const [projectData, setProjectData] = useState<{name: string, client_name: string, status: string} | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [materialType, setMaterialType] = useState<'stone' | 'cement' | 'both'>('stone');
  const [newTaskName, setNewTaskName] = useState('');
  const [addingToCategory, setAddingToCategory] = useState<string | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [uncompleteConfirm, setUncompleteConfirm] = useState<{id: string, taskName: string} | null>(null);

  useEffect(() => {
    fetchChecklistAndAudits();
  }, [projectId]);

  const fetchChecklistAndAudits = async () => {
    try {
      const [checklistResponse, auditResponse, projectResponse] = await Promise.all([
        supabase
          .from('project_checklists')
          .select('*')
          .eq('project_id', projectId)
          .order('order_index', { ascending: true }),
        supabase
          .from('audit_logs')
          .select('*')
          .eq('project_id', projectId)
          .eq('action', 'Checklist Item Completed')
          .order('created_at', { ascending: false }),
        supabase
          .from('projects')
          .select('name, client_name, status')
          .eq('id', projectId)
          .single()
      ]);

      if (checklistResponse.error) throw checklistResponse.error;
      
      setItems(checklistResponse.data || []);
      if (projectResponse.data) setProjectData(projectResponse.data);

      // Map audits to items (latest completion per item)
      const audits: Record<string, ItemAudit> = {};
      if (auditResponse.data) {
        auditResponse.data.forEach(log => {
          // log.details contains the item.id
          if (!audits[log.details]) {
            audits[log.details] = {
              user_name: log.user_name,
              created_at: log.created_at
            };
          }
        });
      }
      setItemAudits(audits);

    } catch (error) {
      console.error('Error fetching checklist:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generatePlan = async () => {
    setIsGenerating(true);
    try {
      const newItems: Partial<ChecklistItem>[] = [];
      let order = 0;

      // Add Design Items
      DESIGN_ITEMS.forEach(item => {
        newItems.push({
          project_id: projectId,
          stage: 'Design & Prep',
          category: 'Design',
          task_name: item,
          is_completed: false,
          order_index: order++
        });
      });

      // Add Construction Items based on material
      let constructionItems = STONE_CONSTRUCTION_ITEMS;
      let categoryName = 'Construction (Stone)';
      
      if (materialType === 'cement') {
        constructionItems = CEMENT_CONSTRUCTION_ITEMS;
        categoryName = 'Construction (Cement)';
      } else if (materialType === 'both') {
        // Import BOTH_CONSTRUCTION_ITEMS from templates
        const { BOTH_CONSTRUCTION_ITEMS } = await import('../lib/checklistTemplates');
        constructionItems = BOTH_CONSTRUCTION_ITEMS;
        categoryName = 'Construction (Stone & Cement)';
      }

      constructionItems.forEach(item => {
        newItems.push({
          project_id: projectId,
          stage: 'In Progress',
          category: categoryName,
          task_name: item,
          is_completed: false,
          order_index: order++
        });
      });

      // Add Observation Items
      OBSERVATION_ITEMS.forEach(item => {
        newItems.push({
          project_id: projectId,
          stage: 'Observations',
          category: 'Observations',
          task_name: item,
          is_completed: false,
          order_index: order++
        });
      });

      const { error } = await supabase.from('project_checklists').insert(newItems);
      if (error) throw error;

      toast.success('Execution plan generated successfully!');
      fetchChecklistAndAudits();
    } catch (error) {
      console.error('Error generating plan:', error);
      toast.error('Failed to generate execution plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const confirmUncompleteTask = async () => {
    if (!uncompleteConfirm) return;
    await performToggleItem(uncompleteConfirm.id, true, uncompleteConfirm.taskName);
    setUncompleteConfirm(null);
  };

  const toggleItem = async (id: string, currentStatus: boolean, taskName: string) => {
    // If the task is being un-completed, prompt the user for confirmation
    if (currentStatus === true) {
      setUncompleteConfirm({ id, taskName });
      return;
    }

    await performToggleItem(id, currentStatus, taskName);
  };

  const performToggleItem = async (id: string, currentStatus: boolean, taskName: string) => {
    try {
      // Optimistic update
      const updatedItems = items.map(item => item.id === id ? { ...item, is_completed: !currentStatus } : item);
      setItems(updatedItems);
      
      const { error } = await supabase
        .from('project_checklists')
        .update({ is_completed: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      // Handle Automatic Project Status transition
      // We only want to progress the status forward or backward based on the checklist
      const designApprovalCompleted = updatedItems.some(i => i.task_name === 'Client: Approval of Design and Material to be used' && i.is_completed);
      
      const constructionItems = updatedItems.filter(i => i.category.startsWith('Construction'));
      const constructionStarted = constructionItems.length > 0 && constructionItems.some(i => i.is_completed);
      const allConstructionCompleted = constructionItems.length > 0 && constructionItems.every(i => i.is_completed);

      const observationItems = updatedItems.filter(i => i.category === 'Observations');
      const allObservationsCompleted = observationItems.length > 0 && observationItems.every(i => i.is_completed);

      let newStatus = 'Discussion';
      if (allConstructionCompleted && allObservationsCompleted) {
        newStatus = 'Handover'; 
      } else if (allConstructionCompleted) {
        newStatus = 'Observations'; 
      } else if (constructionStarted) {
        newStatus = 'In Progress';
      } else if (designApprovalCompleted) {
        newStatus = 'Design & Prep';
      }

      // We only update if the status should change, but let's just always sync it unless the project is On Hold
      // To do this properly, we need the current project status. We can get it from projectData if it's available.
      // Easiest is to just fire the update to projects. We'll add project status to projectData.
      if (projectData && projectData.status !== 'Work is on hold' && projectData.status !== newStatus) {
        await supabase.from('projects').update({ status: newStatus }).eq('id', projectId);
        setProjectData({ ...projectData, status: newStatus });
        if (onUpdate) onUpdate();
      }

      // Log to AuditLog if completed
      if (!currentStatus && user) {
        await supabase.from('audit_logs').insert([{
          project_id: projectId,
          user_id: user.id,
          user_name: user.full_name,
          action: 'Checklist Item Completed',
          details: id // Store item ID to map it back
        }]);
      }
      
      fetchChecklistAndAudits();
    } catch (error) {
      console.error('Error toggling item:', error);
      toast.error('Failed to update task');
      fetchChecklistAndAudits(); // Revert on error
    }
  };

  const updateEntryDate = async (id: string, date: string) => {
    try {
      // Optimistic update
      setItems(items.map(item => item.id === id ? { ...item, entry_date: date } : item));
      
      const { error } = await supabase
        .from('project_checklists')
        .update({ entry_date: date })
        .eq('id', id);

      if (error) throw error;
      toast.success('Entry date updated');
    } catch (error) {
      console.error('Error updating entry date:', error);
      toast.error('Failed to update entry date');
      fetchChecklistAndAudits(); // Revert on error
    }
  };

  const addCustomTask = async (category: string, stage: string) => {
    if (!newTaskName.trim()) return;

    try {
      const categoryItems = items.filter(i => i.category === category);
      const maxOrder = categoryItems.length > 0 ? Math.max(...categoryItems.map(i => i.order_index)) : 0;

      const { error } = await supabase.from('project_checklists').insert([{
        project_id: projectId,
        stage,
        category,
        task_name: newTaskName.trim(),
        is_completed: false,
        order_index: maxOrder + 1
      }]);

      if (error) throw error;
      
      setNewTaskName('');
      setAddingToCategory(null);
      fetchChecklistAndAudits();
      toast.success('Custom task added');
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('Failed to add task');
    }
  };

  const moveItem = async (item: ChecklistItem, direction: 'up' | 'down') => {
    const categoryItems = items.filter(i => i.category === item.category).sort((a, b) => a.order_index - b.order_index);
    const currentIndex = categoryItems.findIndex(i => i.id === item.id);
    
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === categoryItems.length - 1) return;

    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapItem = categoryItems[swapIndex];

    try {
      // Optimistic update
      const newItems = items.map(i => {
        if (i.id === item.id) return { ...i, order_index: swapItem.order_index };
        if (i.id === swapItem.id) return { ...i, order_index: item.order_index };
        return i;
      });
      setItems(newItems);

      // Update in DB
      await Promise.all([
        supabase.from('project_checklists').update({ order_index: swapItem.order_index }).eq('id', item.id),
        supabase.from('project_checklists').update({ order_index: item.order_index }).eq('id', swapItem.id)
      ]);
    } catch (error) {
      console.error('Error reordering tasks:', error);
      toast.error('Failed to reorder tasks');
      fetchChecklistAndAudits(); // Revert
    }
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    
    try {
      const { error } = await supabase.from('project_checklists').delete().eq('id', itemToDelete);
      if (error) throw error;
      setItems(items.filter(item => item.id !== itemToDelete));
      setItemToDelete(null);
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const confirmReset = async () => {
    try {
      const { error } = await supabase
        .from('project_checklists')
        .delete()
        .eq('project_id', projectId);

      if (error) throw error;

      toast.success('Execution plan reset successfully');
      setIsResetConfirmOpen(false);
      fetchChecklistAndAudits();
    } catch (error) {
      console.error('Error resetting plan:', error);
      toast.error('Failed to reset execution plan');
    }
  };

  const downloadReport = () => {
    const doc = new jsPDF();
    
    // Add title and project info
    doc.setFontSize(16);
    doc.text('Execution Plan Report', 14, 15);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Project Name: ${projectData?.name || 'Unknown'}`, 14, 25);
    doc.text(`Client Name: ${projectData?.client_name || 'Unknown'}`, 14, 31);
    doc.text(`Date Generated: ${format(new Date(), 'MMM dd, yyyy')}`, 14, 37);

    // Sort items by execution order
    const categoryOrder = (cat: string) => {
      if (cat === 'Design') return 1;
      if (cat.startsWith('Construction')) return 2;
      if (cat === 'Observations') return 3;
      return 4;
    };

    const sortedItems = [...items].sort((a, b) => {
      if (a.category === b.category) {
        return a.order_index - b.order_index;
      }
      return categoryOrder(a.category) - categoryOrder(b.category);
    });

    const tableData = sortedItems.map(item => {
      const audit = itemAudits[item.id];
      // Determine date: use entry_date if available
      // If empty AND task is completed, fallback to the created_at from audit log
      let dateField = item.entry_date || '';
      if (!dateField && audit) {
        dateField = format(new Date(audit.created_at), 'yyyy-MM-dd');
      }

      const status = item.is_completed ? 'Completed' : 'Pending';

      return [
        item.stage,
        item.category,
        item.task_name,
        status,
        dateField || '-'
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: [['Stage', 'Category', 'Task Name', 'Status', 'Date']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }, // Indigo 600
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 35 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 20 },
        4: { cellWidth: 25 },
      },
    });

    const fileName = `execution_plan_report_${projectData?.name?.replace(/\s+/g, '_') || 'project'}.pdf`;
    doc.save(fileName);
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
  }

  if (items.length === 0) {
    const canGenerate = hasProjectManagementAccess(user?.role) || hasFinanceAccess(user?.role);
    
    if (!canGenerate) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#121212]">
          <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-2">Execution Plan Pending</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 text-center max-w-md">
            The execution plan for this project has not been generated yet. Please contact an Admin or Chief Sthapathy.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl bg-slate-50 dark:bg-[#121212]">
        <h3 className="text-lg font-bold text-slate-900 dark:text-zinc-100 mb-2">Generate Execution Plan</h3>
        <p className="text-sm text-slate-500 dark:text-zinc-400 text-center max-w-md mb-6">
          Create a detailed, phased checklist for this project based on the construction material.
        </p>
        
        <div className="flex items-center gap-4 mb-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="material" 
              value="stone" 
              checked={materialType === 'stone'} 
              onChange={() => setMaterialType('stone')}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-zinc-300">Stone</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="material" 
              value="cement" 
              checked={materialType === 'cement'} 
              onChange={() => setMaterialType('cement')}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">Cement</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input 
              type="radio" 
              name="material" 
              value="both" 
              checked={materialType === 'both'} 
              onChange={() => setMaterialType('both')}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm font-medium text-slate-700">Stone & Cement</span>
          </label>
        </div>

        <Button onClick={generatePlan} disabled={isGenerating} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Generate Plan
        </Button>
      </div>
    );
  }

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const totalItems = items.length;
  const completedItems = items.filter(i => i.is_completed).length;
  const progressPercentage = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

  const themeColors = getDashboardColors();

  return (
    <div className="space-y-8">
      {/* Overall Progress */}
      <div className="bg-white dark:bg-[#121212] dark:bg-slate-900 dark:border-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex justify-between items-end mb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Overall Execution Progress</h3>
            <p className="text-xs text-slate-500">{completedItems} of {totalItems} tasks completed</p>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={downloadReport} className={cn("hover:bg-slate-50 dark:bg-slate-950", themeColors.text, themeColors.border)}>
              <Download className="w-4 h-4 mr-2" />
              Report
            </Button>
            {hasProjectManagementAccess(user?.role) && (
              <Button variant="outline" size="sm" onClick={() => setIsResetConfirmOpen(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Plan
              </Button>
            )}
            <span className={cn("text-2xl font-black", themeColors.text)}>{progressPercentage}%</span>
          </div>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
          <div 
            className={cn("h-3 rounded-full transition-all duration-500 ease-out", themeColors.solid)} 
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Categories */}
      {Object.keys(groupedItems).sort((a, b) => {
        const order = (cat: string) => {
          if (cat === 'Design') return 1;
          if (cat.startsWith('Construction')) return 2;
          if (cat === 'Observations') return 3;
          return 4;
        };
        return order(a) - order(b);
      }).map((category) => {
        const categoryItems = groupedItems[category];
        const catCompleted = categoryItems.filter(i => i.is_completed).length;
        const catTotal = categoryItems.length;
        let stage = categoryItems[0]?.stage || 'Design & Prep';
        if (category === 'Observations') stage = 'Observations';

        return (
          <div key={category} className="bg-white dark:bg-[#121212] border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
            <div className="bg-slate-50 dark:bg-[#181818] px-4 py-3 border-b border-slate-200 dark:border-white/10 flex justify-between items-center">
              <div>
                <h4 className="font-bold text-slate-900 dark:text-zinc-100">{category}</h4>
                <p className="text-[10px] uppercase tracking-widest font-bold text-slate-400">{stage}</p>
              </div>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10 px-2 py-1 rounded-md">
                {catCompleted} / {catTotal}
              </span>
            </div>
            
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {categoryItems.sort((a, b) => a.order_index - b.order_index).map(item => {
                const isClientTask = item.task_name.startsWith('Client');
                const audit = itemAudits[item.id];

                return (
                  <div key={item.id} className={`flex items-center justify-between p-3 transition-colors group ${isClientTask ? 'bg-amber-50/50 hover:bg-amber-50 dark:bg-amber-500/5 dark:hover:bg-amber-500/10' : 'hover:bg-slate-50 dark:hover:bg-[#181818]'}`}>
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => toggleItem(item.id, item.is_completed, item.task_name)}
                    >
                      {item.is_completed ? (
                        <CheckCircle2 className={`w-5 h-5 shrink-0 ${isClientTask ? 'text-amber-500' : 'text-emerald-500'}`} />
                      ) : (
                        <Circle className={`w-5 h-5 shrink-0 transition-colors ${isClientTask ? 'text-amber-200 group-hover:text-amber-400' : 'text-slate-300 group-hover:text-indigo-400'}`} />
                      )}
                      
                      <div className="flex flex-col">
                        <span className={`text-sm ${item.is_completed ? 'text-slate-400 dark:text-zinc-600 line-through' : (isClientTask ? 'text-amber-900 dark:text-amber-100 font-bold' : 'text-slate-700 dark:text-zinc-200 font-medium')}`}>
                          {item.task_name}
                        </span>
                        
                        {item.is_completed && audit && (
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-white/5 dark:text-zinc-400 px-1.5 py-0.5 rounded">
                              <UserIcon className="w-3 h-3" />
                              {audit.user_name}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-zinc-500">
                              <Clock className="w-3 h-3" />
                              {format(new Date(audit.created_at), 'MMM d, h:mm a')}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => moveItem(item, 'up')}
                          className="p-0.5 text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Move Up"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button 
                          onClick={() => moveItem(item, 'down')}
                          className="p-0.5 text-slate-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          title="Move Down"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <input 
                        type="date"
                        value={item.entry_date || ''}
                        onChange={(e) => updateEntryDate(item.id, e.target.value)}
                        className="text-xs border border-slate-200 dark:border-white/10 rounded px-2 py-1 text-slate-500 focus:outline-none focus:border-indigo-500 bg-transparent hover:bg-white dark:hover:bg-[#121212] transition-colors"
                        title="Entry Date (Completion Date)"
                      />
                      <button 
                        onClick={() => setItemToDelete(item.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Custom Task */}
            <div className="p-3 bg-slate-50 dark:bg-[#181818] border-t border-slate-100 dark:border-white/10">
              {addingToCategory === category ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="Enter custom task name..."
                    className="flex-1 text-sm px-3 py-1.5 border border-slate-200 dark:border-white/10 dark:bg-[#121212] dark:text-zinc-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addCustomTask(category, stage);
                      if (e.key === 'Escape') {
                        setAddingToCategory(null);
                        setNewTaskName('');
                      }
                    }}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => addCustomTask(category, stage)} className="h-8">Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAddingToCategory(null); setNewTaskName(''); }} className="h-8">Cancel</Button>
                </div>
              ) : (
                <button 
                  onClick={() => setAddingToCategory(category)}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Custom Task
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Reset Confirmation Dialog */}
      <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Execution Plan</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the execution plan? All progress and custom tasks will be lost. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsResetConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReset}>Reset Plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemToDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Uncomplete Task Confirmation Dialog */}
      <Dialog open={!!uncompleteConfirm} onOpenChange={(open) => !open && setUncompleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redo Completed Task</DialogTitle>
            <DialogDescription>
              Are you sure you want to redo the task "{uncompleteConfirm?.taskName}"? This will mark it as incomplete again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUncompleteConfirm(null)}>Cancel</Button>
            <Button variant="default" onClick={confirmUncompleteTask}>Yes, redo task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
