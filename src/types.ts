export type ProjectStatus = 
  | 'Discussion' 
  | 'Design & Prep' 
  | 'In Progress' 
  | 'Observations'
  | 'Work is on hold' 
  | 'Handover'
  | 'Advance Received' // Kept for legacy compatibility
  | 'Construction'     // Kept for legacy compatibility
  | 'Completed';       // Kept for legacy compatibility

export type UserRole = 
  | 'admin'
  | 'chief_sthapathy'
  | 'deputy_sthapathy'
  | 'assistant_sthapathy'
  | 'junior_sthapathy'
  | 'finance_manager'
  | 'employee';

export const RoleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  chief_sthapathy: 'Chief Sthapathy',
  deputy_sthapathy: 'Deputy Sthapathy',
  assistant_sthapathy: 'Assistant Sthapathy',
  junior_sthapathy: 'Junior Sthapathy',
  finance_manager: 'Finance Manager',
  employee: 'Employee'
};

export const hasAdminAccess = (role?: UserRole) => role === 'admin' || role === 'chief_sthapathy';
export const hasProjectManagementAccess = (role?: UserRole) => hasAdminAccess(role) || role === 'deputy_sthapathy';
export const hasFinanceAccess = (role?: UserRole) => hasAdminAccess(role) || role === 'finance_manager';
export const hasAuditLogAccess = (role?: UserRole) => hasAdminAccess(role) || role === 'finance_manager';
export const isLimitedUser = (role?: UserRole) => role === 'junior_sthapathy' || role === 'employee';
export const canDownloadDrawings = (role?: UserRole) => role !== 'junior_sthapathy' && role !== 'finance_manager' && role !== 'employee';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at?: string;
  emp_code?: string;
  designation?: string;
  DOJ?: string;
  phone_number?: string;
}

export interface Project {
  id: string;
  name: string;
  client_name: string;
  description: string | null;
  status: ProjectStatus;
  progress: number;
  deadline: string | null; // Target completion
  completed_at: string | null;
  assigned_to: string; // User ID or Name
  last_updated: string;
  created_at: string;
  logo_url?: string;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: 'Todo' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  deadline: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  comment?: string | null;
  attachment_url?: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  project_id: string;
  author: string;
  text: string;
  type: 'internal' | 'client';
  attachment_url: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  project_id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: string;
}

export interface TransactionComment {
  id: string;
  text: string;
  author: string;
  date: string;
}

export interface PaymentReceipt {
  id: string;
  amount: number;
  date: string;
  author: string;
}

export interface PaymentStageHistoryData {
  comments: TransactionComment[];
  receipts: PaymentReceipt[];
}

export interface PaymentStage {
  id: string;
  project_id: string;
  stage_name: string;
  amount: number;
  amount_received: number;
  status: 'Pending' | 'Paid' | 'Overdue';
  due_date: string | null;
  received_date: string | null;
  comments?: string; // JSON string of TransactionComment[]
}

export interface Vendor {
  id: string;
  vendor_name: string;
  contact_person_name: string;
  phone_no: string;
  email?: string;
  pan_card_no: string;
  gst_no: string;
  services_list: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  bank_name?: string;
  created_at: string;
}

export interface VendorOrder {
  id: string;
  project_id: string;
  vendor_id: string;
  order_date: string;
  order_details: string;
  terms: string;
  total_amount: number;
  amount_paid: number;
  status: 'Pending' | 'In Progress' | 'Completed';
  comments: string;
  created_at: string;
}

export interface ProjectFile {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  url: string;
  uploaded_by: string;
  created_at: string;
}

export interface EmployeeSalary {
  id: string;
  profile_id: string;
  monthly_salary: number;
  effective_date: string;
  created_at?: string;
  created_by?: string;
}
