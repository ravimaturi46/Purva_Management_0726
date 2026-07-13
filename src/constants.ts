import { ProjectStatus } from './types';

export const PROJECT_STAGES: ProjectStatus[] = [
  'Discussion',
  'Design & Prep',
  'In Progress',
  'Observations',
  'Work is on hold',
  'Handover'
];

export const STAGE_LABELS: Record<ProjectStatus, string> = {
  'Discussion': 'Discussion',
  'Design & Prep': 'Design & Prep',
  'In Progress': 'In Progress',
  'Observations': 'Observations',
  'Work is on hold': 'On Hold',
  'Handover': 'Handover',
  // Legacy mappings
  'Advance Received': 'Design & Prep',
  'Construction': 'In Progress',
  'Completed': 'Handover'
};

export const TASK_TEMPLATES: Record<ProjectStatus, string[]> = {
  'Discussion': [
    'Draft Preliminary Proposal',
    'Generate Rough Concept Sketches',
    'Conduct Initial Site Measurements',
    'Client Requirement Sign-off',
    'Follow-up: Advance Payment',
    'Execute Work Order / Contract',
    'Request Technical Site Survey',
    'Finalize Resource Budget'
  ],
  'Design & Prep': [
    'Develop Detailed Section Drawings',
    'Issue Stone/Idol Purchase Order',
    'Issue Brass Idol Fabrication Order',
    'Procure Dwajasthambam Log',
    'Finalize Temple Cost Estimates',
    'Initiate 3D Model Production',
    'Civil Work Update: Week 1'
  ],
  'In Progress': [
    'Review/Approve Revised Drawings',
    'Map Section & Layer Planes',
    'Detail Elevation Ornaments',
    'Sign Primary Sub-Contractor Agreement',
    'Sign Ancillary Vendor Contracts',
    'Weekly Structural Site Inspection'
  ],
  'Observations': [
    'Electrical wiring verification',
    'Plumbing verification',
    'HVAC / AC point verification',
    'Final aesthetic review'
  ],
  'Work is on hold': [
    'Document Site Halt Reason',
    'Contractual Terms Re-validation',
    'Quarterly Status Site Visit',
    'Resource Demobilization Log'
  ],
  'Handover': [
    'Verify Final Payment Status',
    'Audit Labor & Skill Expenses',
    'Schedule Consecration Ceremony',
    'Archive Project Documentation'
  ],
  // Fallbacks
  'Advance Received': [],
  'Construction': [],
  'Completed': []
};
