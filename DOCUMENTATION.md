# 📚 Dokumentasi Lengkap - Agenda Flow

> **Aplikasi Manajemen Agenda Rapat & Surat**  
> **Tech Stack:** React + TypeScript + Vite + Supabase + Tailwind CSS  
> **Version:** 1.0.0  
> **Last Updated:** 2026-04-02

---

## 📋 Daftar Isi

1. [Overview](#-overview)
2. [Tech Stack](#-tech-stack)
3. [Project Structure](#-project-structure)
4. [Database Schema](#-database-schema)
5. [Services/API](#-servicesapi)
6. [Pages & Routes](#-pages--routes)
7. [Authentication](#-authentication)
8. [Features](#-features)
9. [Environment Variables](#-environment-variables)
10. [Development Guide](#-development-guide)

---

## 🎯 Overview

**Agenda Flow** adalah aplikasi manajemen agenda rapat dan surat untuk organisasi dengan struktur hirarki (Pusat → Cabang → KCP). Aplikasi ini memungkinkan:

- ✅ Manajemen agenda rapat dengan status real-time
- ✅ Sistem persetujuan surat dengan digital signature
- ✅ Monitoring PIC (Person in Charge)
- ✅ Activity logging untuk audit trail
- ✅ Multi-level user hierarchy
- ✅ Dashboard analytics dengan chart

### **User Roles:**
| Role | Description |
|------|-------------|
| `admin` | Full access, manage users & settings |
| `user` | Create agenda, view reports, sign letters |

### **Office Types:**
| Type | Level |
|------|-------|
| `Pusat` | Headquarters |
| `Cabang` | Branch office |
| `KCP` | Small branch office |

---

## 🛠️ Tech Stack

### **Frontend:**
| Package | Version | Purpose |
|---------|---------|---------|
| React | ^18.3.1 | UI Framework |
| TypeScript | ^5.8.3 | Type Safety |
| Vite | ^5.4.19 | Build Tool |
| Tailwind CSS | ^3.4.17 | Styling |
| shadcn/ui | latest | Component Library |

### **State Management & Data:**
| Package | Purpose |
|---------|---------|
| @tanstack/react-query | Server state management |
| Supabase | Backend as a Service |
| Zustand | (implied) Client state |

### **UI Components:**
| Package | Purpose |
|---------|---------|
| @radix-ui/* | Headless UI primitives |
| framer-motion | Animations |
| lucide-react | Icons |
| recharts | Charts |
| react-hook-form | Form handling |
| zod | Schema validation |

### **Features:**
| Package | Purpose |
|---------|---------|
| @dnd-kit/* | Drag & drop |
| exceljs | Excel export |
| jspdf | PDF generation |
| date-fns | Date formatting |

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── adapters/          # Data mapping (DB → UI)
│   │   ├── agenda.adapter.ts
│   │   ├── surat.adapter.ts
│   │   └── user.adapter.ts
│   │
│   ├── components/        # React components
│   │   ├── ui/           # shadcn/ui components
│   │   └── [feature]/    # Feature components
│   │
│   ├── data/             # Static data
│   │
│   ├── hooks/            # Custom React hooks
│   │   ├── use-auth.ts
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   │
│   ├── lib/              # Utilities
│   │   ├── supabase.ts   # Supabase client
│   │   └── utils.ts      # Helper functions
│   │
│   ├── pages/            # Page components
│   │   ├── activity-logs/
│   │   ├── admin/
│   │   ├── agenda/
│   │   ├── auth/
│   │   ├── calendar/
│   │   ├── dashboard/
│   │   ├── monitoring-pic/
│   │   ├── settings/
│   │   ├── surat/
│   │   └── user-chat/
│   │
│   ├── providers/        # Context providers
│   │
│   ├── services/         # API services
│   │   ├── agenda.service.ts
│   │   ├── agenda-filter.service.ts
│   │   ├── auth.service.ts
│   │   ├── dashboard.service.ts
│   │   ├── surat.service.ts
│   │   ├── user.service.ts
│   │   └── ...
│   │
│   ├── types/            # TypeScript types
│   │   ├── agenda.ts
│   │   ├── surat.ts
│   │   ├── user.ts
│   │   └── dashboard.ts
│   │
│   ├── App.tsx           # Main app component
│   ├── main.tsx          # Entry point
│   └── index.css         # Global styles
│
├── .env                  # Environment variables
├── dockerfile            # Docker config
├── tailwind.config.ts    # Tailwind config
├── vite.config.ts        # Vite config
└── package.json
```

---

## 🗄️ Database Schema

### **Tables:**

#### **1. profiles** (User Profiles)
```sql
- id: uuid (PK)
- email: string
- full_name: string
- nik: string
- job_title: string
- role: enum ('admin', 'user')
- avatar_url: string
- phone: string
- office_id: uuid (FK → master_offices)
- department_id: uuid (FK → master_departments)
- parent_id: uuid (self-reference for hierarchy)
- join_date: date
- resign_date: date
- is_active: boolean
- deleted_at: timestamp
```

#### **2. agendas** (Meeting Agendas)
```sql
- id: uuid (PK)
- title: string
- description: text
- location: string
- status: enum ('Scheduled', 'Ongoing', 'Completed', 'Deleted', 'Overdue')
- start_time: timestamp
- end_time: timestamp
- created_by: uuid (FK → profiles)
- completed_at: timestamp
- deleted_at: timestamp
```

**Status Flow:**
```
Scheduled → Ongoing → Completed
   ↓
Deleted / Overdue
```

#### **3. activity_logs** (Audit Trail)
```sql
- id: uuid (PK)
- user_id: uuid (FK → profiles)
- action: enum ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'RESCHEDULE', 'RESTORE', 'COMPLETE')
- table_name: string
- record_id: string
- old_values: jsonb
- new_values: jsonb
- details: text
- created_at: timestamp
```

#### **4. surat_registrasi** (Letter Registration)
```sql
- id: uuid (PK)
- no_surat: string
- judul_surat: string
- file_path: string
- status: string
- current_step: int
- entity_id: uuid (FK)
- office_id: uuid (FK)
- project_id: uuid (FK)
- dept_id: uuid (FK)
- letter_type_id: uuid (FK)
- penggunaan_id: uuid (FK)
```

#### **5. surat_signatures** (Digital Signatures)
```sql
- id: uuid (PK)
- surat_id: uuid (FK → surat_registrasi)
- role_name: string
- step_order: int
- is_signed: boolean
- signed_at: timestamp
- signed_by: uuid (FK → profiles)
```

#### **6. Master Tables:**
- `master_offices` - Kantor (Pusat/Cabang/KCP)
- `master_departments` - Departemen
- `master_entities` - Entitas bisnis
- `master_projects` - Project
- `master_letter_types` - Jenis surat

---

## 🔌 Services/API

### **Auth Service** (`auth.service.ts`)

```typescript
// Get current logged in user
getCurrentUser(): Promise<User | null>

// Sign out
signOut(): Promise<void>
```

**Usage:**
```typescript
import { getCurrentUser, signOut } from '@/services/auth.service';

const user = await getCurrentUser();
await signOut();
```

---

### **Agenda Service** (`agenda.service.ts`)

```typescript
// Get agendas for parent (with hierarchy)
getAgendasForParent(
  parentId: string,
  selectedUserId?: string,
  officeId?: string
): Promise<Agenda[]>

// Get agendas for current user
getAgendasForCurrentUser(userId: string): Promise<Agenda[]>

// Create new agenda
export async function createAgenda(
  agenda: AgendaFormValues
): Promise<{ success: boolean; data?: Agenda; error?: string }>

// Update agenda
export async function updateAgenda(
  id: string,
  updates: Partial<Agenda>
): Promise<{ success: boolean; error?: string }>

// Complete agenda
export async function completeAgenda(
  id: string
): Promise<{ success: boolean; error?: string }>

// Soft delete agenda
export async function deleteAgenda(
  id: string
): Promise<{ success: boolean; error?: string }>

// Restore deleted agenda
export async function restoreAgenda(
  id: string
): Promise<{ success: boolean; error?: string }>

// Reschedule agenda
export async function rescheduleAgenda(
  id: string,
  newStartTime: string,
  newEndTime: string
): Promise<{ success: boolean; error?: string }>
```

**Usage:**
```typescript
import { 
  getAgendasForParent, 
  createAgenda,
  completeAgenda 
} from '@/services/agenda.service';

// Get all agendas for parent view
const agendas = await getAgendasForParent(parentId, selectedUserId, officeId);

// Create new agenda
const result = await createAgenda({
  title: "Rapat Bulanan",
  description: "Diskusi progress project",
  location: "Ruang Meeting A",
  startTime: "2026-04-05T09:00:00",
  endTime: "2026-04-05T11:00:00",
  status: "Scheduled"
});

// Complete agenda
await completeAgenda(agendaId);
```

---

### **User Service** (`user.service.ts`)

```typescript
// Get all users
getUsers(): Promise<User[]>

// Update user profile
updateUserProfile(
  userId: string, 
  updates: Partial<User>
): Promise<{ success: boolean; error?: string }>

// Get users by office
getUsersByOffice(officeId: string): Promise<User[]>

// Get subordinates (bawahan)
getSubordinates(parentId: string): Promise<User[]>
```

**Usage:**
```typescript
import { getUsers, updateUserProfile } from '@/services/user.service';

const users = await getUsers();

await updateUserProfile(userId, {
  fullName: "John Doe",
  jobTitle: "Manager",
  officeId: "uuid-office"
});
```

---

### **Surat Service** (`surat.service.ts`)

```typescript
// Generate nomor surat
async generateNoSurat(payload: {
  entity_id: string;
  letter_type_id: string;
  office_id: string;
  project_id?: string;
  dept_id?: string;
}): Promise<{ fullNumber: string; noUrut: number }>

// Create surat
async createSurat(data: Partial<SuratRegistrasi>): Promise<SuratRegistrasi>

// Get surat by ID
async getSuratById(id: string): Promise<SuratRegistrasi | null>

// Get all surat
async getAllSurat(): Promise<SuratRegistrasi[]>

// Update surat
async updateSurat(id: string, data: Partial<SuratRegistrasi>): Promise<void>

// Upload file surat
async uploadFile(file: File): Promise<{ path: string; url: string }>

// Sign surat (digital signature)
async signSurat(
  signatureId: string, 
  userId: string
): Promise<{ success: boolean }>
```

**Usage:**
```typescript
import { suratService } from '@/services/surat.service';

// Generate nomor surat
const { fullNumber, noUrut } = await suratService.generateNoSurat({
  entity_id: "uuid-entity",
  letter_type_id: "uuid-type",
  office_id: "uuid-office",
  dept_id: "uuid-dept"
});

// Upload file
const { url } = await suratService.uploadFile(file);
```

---

### **Dashboard Service** (`dashboard.service.ts`)

```typescript
// Get KPI data
getKPIData(): Promise<KPIData[]>

// Get chart data
getChartData(): Promise<ChartData[]>

// Get recent agendas
getRecentAgendas(limit?: number): Promise<Agenda[]>

// Get agenda statistics
getAgendaStats(
  startDate: string,
  endDate: string
): Promise<{
  total: number;
  completed: number;
  ongoing: number;
  scheduled: number;
}>
```

---

### **Activity Log Service** (`activity-log.service.ts`)

```typescript
// Get activity logs
getActivityLogs(
  filters?: {
    userId?: string;
    action?: ActivityAction;
    startDate?: string;
    endDate?: string;
  }
): Promise<ActivityLog[]>

// Create activity log
createActivityLog(
  action: ActivityAction,
  tableName: string,
  recordId: string,
  oldValues?: any,
  newValues?: any,
  details?: string
): Promise<void>
```

---

## 📄 Pages & Routes

### **Public Routes:**
| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | auth/Login.tsx | Login page |

### **Protected Routes:**
| Route | Component | Description | Access |
|-------|-----------|-------------|--------|
| `/` | dashboard/Dashboard.tsx | Dashboard utama | All |
| `/agenda` | agenda/AgendaPage.tsx | Daftar agenda | All |
| `/agenda/new` | agenda/CreateAgenda.tsx | Buat agenda baru | All |
| `/agenda/:id` | agenda/AgendaDetail.tsx | Detail agenda | All |
| `/calendar` | calendar/CalendarPage.tsx | Kalender agenda | All |
| `/surat` | surat/SuratPage.tsx | Daftar surat | All |
| `/surat/new` | surat/CreateSurat.tsx | Buat surat baru | All |
| `/surat/:id` | surat/SuratDetail.tsx | Detail surat | All |
| `/monitoring` | monitoring-pic/MonitoringPage.tsx | Monitoring PIC | Admin/Manager |
| `/activity-logs` | activity-logs/ActivityLogPage.tsx | Log aktivitas | Admin |
| `/admin/users` | admin/UsersPage.tsx | Manajemen user | Admin |
| `/admin/settings` | admin/SettingsPage.tsx | Pengaturan | Admin |
| `/settings` | settings/SettingsPage.tsx | Profile settings | All |
| `/chat` | user-chat/ChatPage.tsx | User chat | All |

---

## 🔐 Authentication

### **Supabase Auth Integration:**

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
```

### **Auth Hook:**

```typescript
// hooks/use-auth.ts
import { useAuth } from '@/hooks/use-auth';

function MyComponent() {
  const { user, isLoading, signOut } = useAuth();
  
  if (isLoading) return <Loading />;
  if (!user) return <Navigate to="/login" />;
  
  return <div>Welcome, {user.fullName}</div>;
}
```

---

## ✨ Features

### **1. Agenda Management**
- Create, read, update, delete agenda
- Status tracking (Scheduled → Ongoing → Completed)
- Reschedule with conflict detection
- Soft delete dengan kemampuan restore
- Hierarchical view (atasan bisa lihat agenda bawahan)

### **2. Surat Management**
- Registration surat dengan auto-generate nomor
- Multi-step approval workflow
- Digital signature dengan stamp/paraf
- File upload (PDF, DOC, etc.)
- Status tracking per step

### **3. User Hierarchy**
- Parent-child relationship (Atasan-Bawahan)
- Office hierarchy (Pusat → Cabang → KCP)
- Department management
- Role-based access control

### **4. Dashboard & Analytics**
- KPI cards dengan trend indicator
- Charts (Bar, Pie, Line)
- Recent activities
- Calendar view

### **5. Activity Logging**
- Audit trail untuk setiap action
- Filter by user, date, action type
- Export to Excel/PDF

### **6. Export Features**
- Export agenda to Excel
- Export surat to PDF
- Export activity logs

---

## 🔧 Environment Variables

### **File:** `.env`

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Optional: Default key for registration
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=eyJhbGciOiJIUzI1NiIs...
```

---

## 🚀 Development Guide

### **Setup Project:**

```bash
# Clone repository
cd "D:\Koding\Agenda Flow\frontend"

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env dengan Supabase credentials

# Run development server
npm run dev
```

### **Build for Production:**

```bash
# Build
npm run build

# Preview build
npm run preview
```

### **Docker Build:**

```bash
# Build Docker image
docker build -t agenda-flow-frontend .

# Run container
docker run -p 80:80 agenda-flow-frontend
```

---

### **Code Standards:**

#### **Type Safety:**
```typescript
// Selalu gunakan types
import type { Agenda, User } from '@/types/agenda';

// Gunakan Zod untuk form validation
const agendaSchema = z.object({
  title: z.string().min(3),
  startTime: z.union([z.string(), z.date()]),
});
```

#### **Service Pattern:**
```typescript
// Export sebagai object atau named functions
export const agendaService = {
  async getAll() { ... },
  async create(data) { ... },
};

// atau
export async function getAgendas() { ... }
```

#### **Error Handling:**
```typescript
try {
  const data = await someService.call();
  return { success: true, data };
} catch (error) {
  console.error('Error:', error);
  return { success: false, error: error.message };
}
```

---

## 📊 Database Relationships

```
profiles
├── office_id → master_offices
├── department_id → master_departments
└── parent_id → profiles (self-reference)

agendas
└── created_by → profiles

activity_logs
└── user_id → profiles

surat_registrasi
├── entity_id → master_entities
├── office_id → master_offices
├── project_id → master_projects
├── dept_id → master_departments
└── letter_type_id → master_letter_types

surat_signatures
├── surat_id → surat_registrasi
└── signed_by → profiles
```

---

## 🔗 Related Documentation

- [Supabase JS Client](https://supabase.com/docs/reference/javascript/)
- [React Query](https://tanstack.com/query/latest)
- [shadcn/ui](https://ui.shadcn.com/)
- [Tailwind CSS](https://tailwindcss.com/)

---

*Dokumentasi ini di-generate otomatis berdasarkan codebase Agenda Flow v1.0.0*
