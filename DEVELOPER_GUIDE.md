# Crop Tracker - Developer Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Local Development Setup](#local-development-setup)
4. [Project Structure](#project-structure)
5. [Architecture & State Management](#architecture--state-management)
6. [Routing & Pages](#routing--pages)
7. [Components Reference](#components-reference)
8. [Database Schema](#database-schema)
9. [Core Business Logic](#core-business-logic)
10. [Team & Farm Sharing](#team--farm-sharing)
11. [Reporting System](#reporting-system)
12. [Utilities & Hooks](#utilities--hooks)
13. [Code Patterns & Conventions](#code-patterns--conventions)
14. [Known Issues & Technical Debt](#known-issues--technical-debt)
15. [Deployment](#deployment)

---

## Project Overview

**Crop Tracker** is a web-based agricultural cost management platform for farmers managing multiple fields across multiple growing seasons. It enables detailed cost tracking at the field level, profitability analysis, commodity sales recording, hedge position tracking, and year-over-year performance comparisons.

### Core Capabilities

- Multi-farm support with farm switching via the sidebar
- Multi-season management with season-to-season data import wizard
- Per-field cost tracking broken down by category (seed, fertilizer, chemicals, operational, land)
- Reusable cost templates with cascading updates across all linked fields
- Field-level cost overrides that survive template updates
- Yield, commodity sales, and commodity hedge recording
- Comprehensive reporting suite with Recharts-based charting
- PDF export of reports
- Team/farm sharing with role-based access (editor, viewer)
- Real-time Dashboard updates via Supabase subscriptions
- Background cascade update processing via Supabase Edge Functions

---

## Technology Stack

### Frontend

| Package | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI framework |
| TypeScript | 5.5.3 | Type safety |
| Vite | 5.4.2 | Build tool and dev server |
| Tailwind CSS | 3.4.1 | Utility-first styling |
| Lucide React | 0.344.0 | Icon library |
| Recharts | 3.7.0 | Charts in report pages |

### Backend

| Package | Version | Purpose |
|---|---|---|
| @supabase/supabase-js | 2.57.4 | Database, auth, real-time subscriptions |

Supabase provides PostgreSQL, row-level security, email/password authentication, real-time change subscriptions, and Edge Functions — no separate backend server required.

### Dev Tools

- ESLint 9.9.1 with typescript-eslint and react-hooks plugins
- PostCSS + Autoprefixer for CSS processing
- TypeScript strict mode enabled

---

## Local Development Setup

### Prerequisites

- Node.js 18 or higher
- npm

### Steps

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the project root:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite development server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint across all source files |
| `npm run typecheck` | Run TypeScript compiler check without emitting |

### Database Migrations

Migrations live in `supabase/migrations/`. When working with a fresh Supabase project, apply migrations in chronological order using the Supabase dashboard SQL editor or CLI. There are 30 migration files as of this writing.

### Edge Functions

The app uses one Supabase Edge Function:

- **`process-cascade-task`** (`supabase/functions/process-cascade-task/index.ts`) — Processes template cascade updates asynchronously. It is deployed via the Supabase CLI or the Supabase MCP tools. It is called from the frontend via a `fetch` call in `src/lib/backgroundTasks.ts`.

---

## Project Structure

```
/
├── src/
│   ├── App.tsx                     Entry point component, routing, season management
│   ├── main.tsx                    React DOM root mount
│   ├── index.css                   Global styles (Tailwind base + custom)
│   ├── vite-env.d.ts               Vite environment type declarations
│   │
│   ├── contexts/
│   │   ├── AuthContext.tsx         Authentication state and methods
│   │   ├── FarmContext.tsx         Active farm tracking for multi-farm support
│   │   └── NotificationContext.tsx Toast notification queue and display
│   │
│   ├── hooks/
│   │   ├── useCascadeTaskNotifications.ts  Polls cascade_tasks for background task progress
│   │   ├── useSalesTracking.ts             Data and CRUD for commodity sales and hedges
│   │   └── useReportData.ts                Data fetching hook for all report pages
│   │
│   ├── lib/
│   │   ├── supabase.ts             Supabase client singleton
│   │   ├── database.types.ts       Auto-generated TypeScript types from Supabase schema
│   │   ├── templateUtils.ts        Template CRUD, cascade update logic, cost calculations
│   │   ├── transactionUtils.ts     Multi-step database operation helpers
│   │   ├── backgroundTasks.ts      Async task coordination and toast notification bridge
│   │   ├── seasonImport.ts         Season-to-season data copy logic
│   │   ├── unitConversions.ts      Unit conversion helpers (lbs, gallons, acres, etc.)
│   │   ├── farms.ts                Farm CRUD operations
│   │   ├── teamMembers.ts          Team invitation and shared farm fetching
│   │   ├── salesUtils.ts           Sales and hedge formatting helpers and constants
│   │   ├── mathUtils.ts            Shared math utility functions
│   │   ├── exportUtils.ts          CSV/data export helpers
│   │   ├── reportTypes.ts          Shared TypeScript types for reports
│   │   └── pdfExport.ts            PDF generation for report export
│   │
│   ├── components/
│   │   ├── DashboardLayout.tsx     Sidebar nav, season selector, farm switcher, layout shell
│   │   ├── Toast.tsx               Toast notification component and container
│   │   ├── NotificationBell.tsx    Bell icon for app notification count
│   │   ├── OverrideBadge.tsx       Visual badge indicating a field cost override is active
│   │   ├── CostItemEditor.tsx      Inline editor for individual cost line items
│   │   ├── Pagination.tsx          Reusable pagination controls
│   │   ├── TemplateForm.tsx        Form for creating and editing cost templates
│   │   ├── TemplateSelector.tsx    Modal for selecting a template to apply to fields
│   │   ├── TemplateApplicationPreview.tsx  Preview and confirm before applying a template
│   │   ├── CascadeUpdateModal.tsx  Progress modal for cascade update operations
│   │   ├── SeasonImportWizard.tsx  Multi-step wizard for importing data from prior seasons
│   │   ├── CrossFarmCopyModal.tsx  Modal for copying templates or programs across farms
│   │   ├── SaleEntryForm.tsx       Form for recording commodity sales
│   │   ├── SalesCommoditySection.tsx  Sales entries grouped by crop type
│   │   ├── HedgeEntryForm.tsx      Form for recording commodity hedge positions
│   │   ├── HedgeCommoditySection.tsx  Hedge entries grouped by crop type
│   │   ├── SeedVarietyAssignment.tsx  Assign seed varieties to fields
│   │   ├── FertilizerPrograms.tsx  Fertilizer program builder and editor
│   │   ├── ChemicalPrograms.tsx    Chemical program builder and editor
│   │   └── reports/
│   │       ├── ReportCard.tsx      Card wrapper for individual report blocks
│   │       └── ReportHeader.tsx    Consistent header component for report pages
│   │
│   └── pages/
│       ├── Auth.tsx                Login and signup page
│       ├── Dashboard.tsx           Season summary with real-time metrics by crop type
│       ├── Fields.tsx              Field list with filtering, costs, and template assignment
│       ├── FieldDetail.tsx         Single-field cost breakdown and override management
│       ├── Products.tsx            Seed, fertilizer, chemical product catalog management
│       ├── CostTemplates.tsx       Template list with creation, editing, deletion
│       ├── Yields.tsx              Harvest yield data entry per field
│       ├── SalesTracking.tsx       Commodity sales and hedge position tracking
│       ├── Reports.tsx             Report hub with navigation to all report categories
│       ├── AccountSettings.tsx     User profile configuration (full name)
│       ├── FarmSettings.tsx        Farm name management and farm deletion
│       ├── Team.tsx                Team member management, invitations, shared farm access
│       └── reports/
│           ├── ProfitabilityReports.tsx
│           ├── FieldPerformanceReports.tsx
│           ├── SalesReports.tsx
│           ├── CostEfficiencyReports.tsx
│           ├── YieldReports.tsx
│           ├── profitability/
│           │   ├── CostBreakdownComparison.tsx
│           │   └── YearOverYearProfit.tsx
│           ├── field/
│           │   ├── FieldCostComparison.tsx
│           │   ├── FieldROI.tsx
│           │   └── FieldYieldRanking.tsx
│           ├── costs/
│           │   ├── BreakEvenAnalysis.tsx
│           │   ├── CostPerBushel.tsx
│           │   └── InputEfficiency.tsx
│           └── sales/
│               ├── BuyerBreakdown.tsx
│               ├── PricingPerformance.tsx
│               └── SalesByMonth.tsx
│
├── supabase/
│   ├── migrations/                 30 SQL migration files (apply in chronological order)
│   └── functions/
│       └── process-cascade-task/
│           └── index.ts            Edge Function for async cascade updates
│
└── docs/
    └── CropTracker_HedgeTracking_PRD_(1).docx  Feature PRD for hedge tracking
```

---

## Architecture & State Management

### Context Providers

The app wraps its component tree in three nested context providers defined in `App.tsx`:

```
AuthProvider
  NotificationProvider
    FarmProvider (receives current user ID)
      AppContent
      ToastContainer
```

#### AuthContext (`src/contexts/AuthContext.tsx`)

Manages Supabase auth state. Provides:

- `user` — current Supabase `User` object or `null`
- `loading` — true while initial auth check is in progress
- `signIn(email, password)` — email/password login
- `signUp(email, password, fullName)` — new account creation
- `signOut()` — logout and clear session

Uses `supabase.auth.onAuthStateChange` to track session changes reactively. The callback is wrapped in an async IIFE to avoid Supabase client deadlocks.

#### FarmContext (`src/contexts/FarmContext.tsx`)

Tracks which farm the user is currently viewing. Critical for multi-farm support where a user may have been invited to view another farmer's data.

Provides:

- `activeFarm: ActiveFarm | null` — the currently active farm record
- `effectiveUserId: string | null` — the user ID to use for data queries (may be the farm owner's ID, not the logged-in user's ID)
- `setOwnFarm(userId, farmName)` — switch to the user's own farm (role: `admin`)
- `setSharedFarm(farm)` — switch to a farm shared with the user (role: `editor` or `viewer`)

The `ActiveFarm` shape:
```typescript
interface ActiveFarm {
  ownerId: string;
  ownerName: string | null;
  farmName: string | null;
  role: 'admin' | 'editor' | 'viewer';
  isOwn: boolean;
}
```

All data queries must use `effectiveUserId` (not `user.id` directly) so they work correctly when viewing a shared farm.

#### NotificationContext (`src/contexts/NotificationContext.tsx`)

Manages a queue of toast notifications. Provides:

- `addNotification(message, type)` — push a toast (`'info'`, `'success'`, `'error'`, `'warning'`)
- `notifications` — current notification array

Auto-dismiss timings: info 3 seconds, success and error 5 seconds.

The background task system (`src/lib/backgroundTasks.ts`) hooks into this context via a registered callback so it can fire toasts from outside React components.

### Routing

The app is a Single Page Application with no URL-based router. Navigation state is managed in `App.tsx` via an `activePage` string stored in `sessionStorage` (so it survives hot reloads). The `DashboardLayout` sidebar calls `onNavigate(pageName)` to switch pages.

The `FieldDetail` page is a special case — it receives a `fieldId` prop rather than being routed to by URL, and the back button returns to the `fields` page.

Pages that must not be visible when viewing a shared farm (`isOwnFarm === false`) are gated in `App.tsx`:
- `account-settings` — hidden for shared farms
- `farm-settings` — hidden for shared farms
- `team` — hidden for shared farms

### Season State

Season data is owned by `App.tsx`, not a context, because it requires async loading and depends on which farm is active. The current season and season list are passed as props through `DashboardLayout` into page components. Page components receive a `seasonId: string | null` prop.

---

## Routing & Pages

### Auth (`src/pages/Auth.tsx`)

Shown when no authenticated user exists. Provides login and signup via Supabase email/password auth.

### Dashboard (`src/pages/Dashboard.tsx`)

Displays season-level summary metrics grouped by crop type (corn, soybeans, wheat):

- Total acres
- Average cost per acre (operational + land)
- Average cost per bushel
- Average yield (bu/acre)
- Profit per acre (based on crop price from `seasons` table)

Subscribes to real-time Supabase changes on `fields`, `field_costs`, `yield_and_price`, and `commodity_sales`. Unsubscribes on unmount.

### Fields (`src/pages/Fields.tsx`)

Lists all fields for the active season. Features:

- Filter by crop type, linked template, and override status
- Per-field cost summary cards (seed, fertilizer, chemicals, operational, land, total)
- Bulk template application to multiple fields at once
- Template linkage indicators
- Read-only mode when `readOnly={true}` (viewer role)

### Field Detail (`src/pages/FieldDetail.tsx`)

Deep-dive view for a single field. Shows every cost line item with:

- Whether the value comes from a template or is field-specific
- Override badges where field values differ from the template
- Inline editing of individual cost items
- Editable land costs (rent per acre, property tax per acre)
- Cost totals: operational only, land only, and grand total

### Products (`src/pages/Products.tsx`)

Tab-based interface covering four product categories:

- **Seeds** — variety name, crop type, price per unit, seeding rate, units per bag
- **Fertilizers** — product name, price per unit, unit type, application rate
- **Chemicals** — chemical name, price per unit, unit type, default application rate
- **Programs** — fertilizer and chemical program builders (see `FertilizerPrograms` and `ChemicalPrograms` components)

### Cost Templates (`src/pages/CostTemplates.tsx`)

Lists all cost templates for the active season. Allows:

- Creating new templates with the `TemplateForm` component
- Viewing how many fields use each template
- Editing existing templates (triggers cascade update check)
- Deleting unused templates
- Cross-farm copy of templates via `CrossFarmCopyModal`

### Yields (`src/pages/Yields.tsx`)

Records harvest data per field:

- Yield in bushels per acre
- Total bushels
- Harvest date
- Moisture percentage
- Notes

### Sales Tracking (`src/pages/SalesTracking.tsx`)

Two-tab interface for recording commodity market activity:

**Sales tab:**
- Crop type (corn, soybeans, wheat)
- Sale date and delivery month
- Destination / buyer
- Bushels sold, price per bushel, total revenue
- Notes

**Hedges tab:**
- Crop type
- Contract date and delivery month
- Contract type (futures, basis, HTA, flat price, etc.)
- Broker / elevator
- Bushels hedged, futures price, basis, net price
- Notes

Data is managed via the `useSalesTracking` hook.

### Reports (`src/pages/Reports.tsx`)

Navigation hub for five report categories. Each category links to a dedicated report page containing multiple sub-reports.

### Account Settings (`src/pages/AccountSettings.tsx`)

User profile management: full name update. Farm name is managed separately in Farm Settings.

### Farm Settings (`src/pages/FarmSettings.tsx`)

Manages the user's owned farms:
- Rename a farm
- Delete a farm (with confirmation; farm owner only)
- Calls `onFarmsUpdated` prop callback to refresh the sidebar farm list after changes

### Team (`src/pages/Team.tsx`)

Manages collaboration:

- Invite a user by email as editor or viewer
- List current team members with their roles
- Revoke access
- View farms that have been shared with the logged-in user
- Switch the active farm context to a shared farm

---

## Components Reference

### DashboardLayout

Main layout shell. Contains:

- Left sidebar with page navigation links
- Season selector dropdown (create, switch, delete seasons)
- Farm switcher when the user has access to shared farms
- Notification bell (`NotificationBell`)
- User menu (logout)

Accepts `readOnly`-aware rendering — the sidebar hides write-only pages (Account Settings, Farm Settings, Team) when viewing a shared farm.

### SeasonImportWizard

Multi-step modal wizard launched when creating a new season with "Import from previous season" selected. Steps:

1. Select which data categories to import (products, programs, templates, fields)
2. Update prices for imported products
3. Review and confirm
4. Execute import (runs through `src/lib/seasonImport.ts`)

### CascadeUpdateModal

Modal that appears during template save operations. Shows per-field progress as the cascade update propagates changes to all fields linked to the template. Uses the `cascade_tasks` table and real-time subscriptions to track progress.

### TemplateApplicationPreview

Shown before bulk-applying a template to selected fields. Displays a before/after cost comparison per field so the user can confirm the change.

### CrossFarmCopyModal

Modal that allows a farm owner to copy cost templates or fertilizer/chemical programs from one owned farm to another. Uses `(supabase as any)` type workaround due to incomplete generated types — see Known Issues.

### CostItemEditor

Inline editor for a single cost line item in `FieldDetail`. Displays the current value, its source (template vs. override), and allows the user to enter a new value. Writes directly to `field_cost_overrides`.

### OverrideBadge

Small visual indicator shown next to cost items that have been overridden at the field level. Provides a "reset to template" action.

### FertilizerPrograms / ChemicalPrograms

Program builders rendered inside the Products page. Allow composing multi-product programs with per-product application rates and an overall application cost. Programs are stored as separate database records and referenced by JSONB arrays in templates.

### SaleEntryForm / HedgeEntryForm

Form modals for adding and editing commodity sales and hedge positions respectively. Used inside `SalesCommoditySection` and `HedgeCommoditySection`.

### SalesCommoditySection / HedgeCommoditySection

Display components that group sales or hedge entries by crop type. Each includes pagination (20 items per page for hedges, configurable for sales).

### Toast / ToastContainer

`Toast` renders a single notification. The container is mounted at the app root (outside `DashboardLayout`) so toasts display over any page including modals.

### Pagination

Generic pagination control component. Accepts `currentPage`, `totalPages`, and an `onPageChange` callback.

---

## Database Schema

### Migrations History

| File | Change |
|---|---|
| `20260205170031` | Initial schema: user_profiles, seasons, fields, seed_varieties, fertilizer_products, individual_chemicals, field_costs, equipment_rates |
| `20260205174842` | Added `units_per_bag` to `seed_varieties` |
| `20260205180913` | Removed `crop_type` from `fertilizer_products` (fertilizers are crop-agnostic) |
| `20260205182443` | Added `fertilizer_programs`, `fertilizer_program_items`, `chemical_programs`, `chemical_program_items`, application costs |
| `20260205182505` | Added junction tables for field-to-program assignments (later dropped) |
| `20260205190304` | Added application rate columns to `chemical_program_items` |
| `20260205193632` | Added `yield_and_price` table |
| `20260205194147` | Added `price` column to `yield_and_price` |
| `20260205194734` | Added `land_rent_per_acre` and `property_tax_per_acre` to `fields` |
| `20260205200039` | Added tillage, planting, harvest, and other operational cost columns to `field_costs` |
| `20260205221117` | Added crop price columns to `seasons` (corn, soybeans, wheat price per bushel) |
| `20260206034309` | Removed unused yield columns from `yield_and_price` |
| `20260208053658` | Added `cost_templates` and `field_cost_overrides` tables |
| `20260208184944` | Added `cascade_tasks` table for background task tracking |
| `20260211012336` | Added `commodity_sales` table |
| `20260217214952` | Dropped field-program junction tables (programs now embedded in templates via JSONB) |
| `20260217221551` | Added `farm_name` to `user_profiles` |
| `20260218055206` | Added `farms` table; added `farm_id` to `seasons` |
| `20260218055235` | Backfilled `farms` records from existing `user_profiles` data |
| `20260218055300` | Updated RLS policies for farm-scoped multi-farm access |
| `20260305180723` | Cleaned up duplicate RLS policies |
| `20260305180749` | Added missing RLS policies for collaboration access patterns |
| `20260305184151` | Added `program_type` column to `cascade_tasks` |
| `20260305184158` | Enabled real-time on `cascade_tasks` table |
| `20260305192457` | Added missing foreign key indexes |
| `20260305192931` | Fixed RLS auth initialization and function search paths |
| `20260305193038` | Consolidated multiple permissive RLS policies |
| `20260305193055` | Dropped unused indexes |
| `20260314235029` | Added `commodity_hedges` table |
| `20260315003529` | Added partial unique index on `team_members(user_id, farm_id, email)` where `status <> 'declined'` to prevent duplicate invitations |

### Tables

#### `user_profiles`
Extends Supabase auth users with app-specific profile data.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Matches `auth.users.id` |
| full_name | text | Display name |
| farm_name | text | Legacy field; farm names now in `farms` table |
| created_at | timestamptz | |
| updated_at | timestamptz | Auto-updated by trigger |

#### `farms`
One record per farm. A user may own multiple farms.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| owner_user_id | uuid | FK → auth.users |
| farm_name | text | |
| is_active | boolean | |
| created_at | timestamptz | |

#### `seasons`
Top-level container for a growing year's data. Each season belongs to a farm.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | Owner |
| farm_id | uuid | FK → farms |
| year | int | e.g. 2026 |
| name | text | e.g. "2026 Growing Season" |
| is_active | boolean | Which season is shown by default on load |
| corn_price_per_bushel | numeric | Used in profit calculations |
| soybeans_price_per_bushel | numeric | |
| wheat_price_per_bushel | numeric | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

#### `fields`
Individual parcels of land within a season.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | FK → seasons |
| user_id | uuid | Owner |
| name | text | Field name |
| crop_type | text | `'corn'`, `'soybeans'`, or `'wheat'` |
| acreage | numeric | |
| land_rent_per_acre | numeric | Field-specific land cost |
| property_tax_per_acre | numeric | Field-specific land cost |
| notes | text | |

#### `seed_varieties`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| product_name | text | |
| crop_type | text | |
| price_per_unit | numeric | |
| unit_type | text | e.g. `'bag'` |
| standard_seeding_rate | numeric | Seeds/acre or bags/acre |
| units_per_bag | numeric | For conversion calculations |

#### `fertilizer_products`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| product_name | text | |
| price_per_unit | numeric | |
| unit_type | text | |
| application_rate | numeric | Default rate |
| application_rate_unit | text | |

#### `individual_chemicals`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| chemical_name | text | |
| price_per_unit | numeric | |
| unit_type | text | |
| default_application_rate | numeric | |
| default_application_rate_unit | text | |

#### `fertilizer_programs`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| program_name | text | |
| application_cost | numeric | Labor/equipment cost to apply |
| notes | text | |

#### `fertilizer_program_items`
Links individual fertilizer products to a program with per-program application rates.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| program_id | uuid | FK → fertilizer_programs |
| fertilizer_product_id | uuid | FK → fertilizer_products |
| application_rate | numeric | |
| application_rate_unit | text | |

#### `chemical_programs`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| program_name | text | |
| crop_type | text | |
| application_cost | numeric | |
| notes | text | |

#### `chemical_program_items`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| program_id | uuid | FK → chemical_programs |
| chemical_id | uuid | FK → individual_chemicals |
| application_rate | numeric | |
| application_rate_unit | text | |

#### `cost_templates`
Reusable cost configurations that can be applied to multiple fields.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | |
| season_id | uuid | |
| name | text | |
| description | text | |
| fertilizer_programs | jsonb | Array of `{program_id, cost_per_acre}` |
| chemical_programs | jsonb | Array of `{program_id, cost_per_acre}` |
| tillage_cost_per_acre | numeric | |
| planting_cost_per_acre | numeric | |
| harvest_cost_per_acre | numeric | |
| equipment_cost_per_acre | numeric | |
| custom_services_cost_per_acre | numeric | |
| labor_cost_per_acre | numeric | |
| crop_insurance_per_acre | numeric | |
| drying_storage_per_acre | numeric | |
| hauling_per_acre | numeric | |
| other_expenses_per_acre | numeric | |

#### `field_costs`
Stores the resolved cost data for a field, including template linkage and all cost columns.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| field_id | uuid | FK → fields |
| user_id | uuid | |
| template_id | uuid | FK → cost_templates (nullable) |
| seed_variety_id | uuid | FK → seed_varieties (nullable) |
| seeding_rate_override | numeric | Field-specific seeding rate |
| (all cost columns) | numeric | Mirrors `cost_templates` cost columns |
| total_cost_per_acre | numeric | Denormalized sum for query performance |

#### `field_cost_overrides`
Records individual cost line items that have been overridden at the field level.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| field_id | uuid | FK → fields |
| cost_item_name | text | Column name of the overridden item |
| override_value | jsonb | The overridden value |

#### `yield_and_price`
Harvest data per field.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| field_id | uuid | FK → fields |
| user_id | uuid | |
| yield_bushels_per_acre | numeric | |
| total_yield_bushels | numeric | |
| harvest_date | date | |
| moisture_percentage | numeric | |
| notes | text | |

#### `commodity_sales`

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | FK → seasons |
| user_id | uuid | |
| crop_type | text | `'corn'`, `'soybeans'`, or `'wheat'` |
| sale_date | date | |
| delivery_month | text | |
| destination | text | Buyer / elevator name |
| bushels_sold | numeric | |
| price_per_bushel | numeric | |
| total_revenue | numeric | |
| notes | text | |

#### `commodity_hedges`
Records hedge positions (futures contracts, basis contracts, HTAs, etc.).

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | FK → seasons |
| user_id | uuid | |
| crop_type | text | `'corn'`, `'soybeans'`, or `'wheat'` |
| contract_date | date | |
| delivery_month | text | |
| contract_type | text | e.g. `'futures'`, `'basis'`, `'hta'`, `'flat_price'` |
| broker_elevator | text | |
| bushels_hedged | numeric | |
| futures_price | numeric | |
| basis | numeric | |
| net_price | numeric | Computed: futures_price + basis |
| notes | text | |

#### `equipment_rates`
Per-crop equipment rate reference data. Seeded with Iowa Custom Rate Survey defaults when a season is created.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| season_id | uuid | |
| user_id | uuid | |
| crop_type | text | |
| rate_per_acre | numeric | |
| source | text | Attribution for default values |
| is_overridden | boolean | Whether user has customized from default |

#### `cascade_tasks`
Tracks progress of background cascade update operations.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | |
| season_id | uuid | |
| task_type | text | e.g. `'template_cascade'` |
| status | text | `'pending'`, `'running'`, `'complete'`, `'error'` |
| entity_id | uuid | ID of the template or product being updated |
| entity_type | text | |
| program_type | text | `'fertilizer'` or `'chemical'` (nullable) |
| result_data | jsonb | `{completed, total, fieldNames}` |
| error_message | text | Set when status is `'error'` |
| created_at | timestamptz | |
| completed_at | timestamptz | |

#### `team_members`
Tracks pending and accepted invitations for farm sharing.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | Farm owner's user ID |
| invited_user_id | uuid | The invited user's ID (nullable until accepted) |
| farm_id | uuid | FK → farms |
| email | text | Invited email address |
| role | text | `'editor'` or `'viewer'` |
| status | text | `'pending'`, `'accepted'`, `'revoked'` |
| invited_at | timestamptz | |
| accepted_at | timestamptz | |

#### `app_notifications`
In-app notification records for the notification bell.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| recipient_user_id | uuid | |
| sender_user_id | uuid | |
| type | text | Notification category |
| payload | jsonb | Notification data |
| is_read | boolean | |
| created_at | timestamptz | |

### Row Level Security

RLS is enabled on all tables. The general policy pattern:

- Users can read, insert, update, or delete their own rows where `user_id = auth.uid()`
- Collaboration is handled at the application level via `FarmContext`. When viewing a shared farm, all queries use `effectiveUserId` (the farm owner's ID). RLS allows this because the owner's `user_id` matches RLS conditions, and the sharing check happens in the application.
- The `auth.uid()` function is used in all policies (never `current_user`).
- `DO NOT` use `USING (true)` in any policy.

---

## Core Business Logic

### Cost Calculation Hierarchy

Costs are resolved from the bottom up:

```
1. Product level     — price per unit for seeds, fertilizers, chemicals
2. Program level     — sum of (product price × application rate) + application cost
3. Template level    — sum of all programs + direct operational cost columns
4. Field level       — template costs, overridden per item where applicable
5. Land costs        — field-specific rent + property tax (never in templates)
6. Total field cost  — operational + land costs
```

The `calculateTemplateCost` function in `src/lib/templateUtils.ts` computes the template-level total. Field totals are stored denormalized in `field_costs.total_cost_per_acre` for dashboard query performance.

### Template Cascade Updates

When a template is saved, a cascade update propagates the new values to all linked fields. The process:

1. The updated template is saved to `cost_templates`
2. A `cascade_tasks` record is created with `status = 'pending'`
3. The frontend calls the `process-cascade-task` Edge Function with the task ID
4. The Edge Function identifies all `field_costs` rows with `template_id` matching the updated template
5. For each field, it applies the new template values, but skips any cost item that has a corresponding row in `field_cost_overrides`
6. Progress is written back to `cascade_tasks.result_data`
7. `CascadeUpdateModal` listens via real-time subscription and shows per-field progress
8. On completion, `backgroundTasks.ts` fires a toast notification

The cascade is coordinated through `src/lib/backgroundTasks.ts` and `src/hooks/useCascadeTaskNotifications.ts`.

### Field Cost Overrides

When a user edits a cost line item on the Field Detail page:

1. The new value is written to `field_cost_overrides` with the column name as `cost_item_name`
2. The `field_costs` row is updated directly for immediate display
3. Future cascade updates from the linked template skip any cost item that has an override record
4. The `OverrideBadge` component reads override records to show the indicator
5. The user can reset an override (delete its `field_cost_overrides` row) to re-link to the template value

### Season Import

When creating a new season with "Import from previous season":

1. `App.tsx` creates the empty season and launches `SeasonImportWizard`
2. The wizard lets the user choose which categories to copy: seeds, fertilizers, chemicals, programs, templates, fields
3. For each selected category, `src/lib/seasonImport.ts` copies records, updating foreign key references to point to the new season's records
4. Product prices can be bulk-updated during import before the copy executes

### Commodity Sales & Hedges

Commodity sales and hedge positions are both scoped to a season. The `useSalesTracking` hook fetches and manages both collections. The `SalesTracking` page renders them in separate tabs via `SalesCommoditySection` and `HedgeCommoditySection`. Both sections group entries by crop type and support pagination.

---

## Team & Farm Sharing

### Inviting Collaborators

From the Team page, the farm owner enters an email address and selects a role (editor or viewer). This creates a `team_members` record with `status = 'pending'`.

When the invited user logs in, the system checks for any pending invitations matching their email address and automatically accepts them, setting `status = 'accepted'` and populating `invited_user_id`.

### Roles

| Role | Capabilities |
|---|---|
| admin | Full access to own farm, can invite/revoke team members, manage farm settings |
| editor | Can view and edit data on the shared farm; cannot manage team or settings |
| viewer | Read-only access to the shared farm |

The `readOnly` prop is passed to all page components when `activeRole === 'viewer'`. Write operations (save buttons, delete actions, inline editing) are hidden or disabled.

### Switching Farms

The sidebar shows a farm switcher when the user has accepted invitations to shared farms. Clicking a shared farm calls `setSharedFarm()` in `FarmContext` and reloads the season list for that farm owner's user ID. All subsequent data queries use `effectiveUserId` from the context.

Switching back to the user's own farm calls `setOwnFarm()` and reloads their seasons.

### Multi-Farm Ownership

A user can own multiple farms. Owned farms are created from `FarmSettings` or during the initial account setup flow. The farm switcher in the sidebar lists both owned farms and farms the user has been invited to.

---

## Reporting System

### Report Structure

Reports live in `src/pages/reports/`. Each category has a parent page and individual report sub-pages:

| Category | Parent Page | Sub-Reports |
|---|---|---|
| Profitability | `ProfitabilityReports.tsx` | Cost Breakdown Comparison, Year-over-Year Profit |
| Field Performance | `FieldPerformanceReports.tsx` | Field Cost Comparison, Field ROI, Field Yield Ranking |
| Sales Analytics | `SalesReports.tsx` | Buyer Breakdown, Pricing Performance, Sales by Month |
| Cost Efficiency | `CostEfficiencyReports.tsx` | Break-Even Analysis, Cost Per Bushel, Input Efficiency |
| Yield Analytics | `YieldReports.tsx` | Yield data visualizations |

### Data Fetching

All report data is fetched via the `useReportData` hook (`src/hooks/useReportData.ts`). It accepts a `seasonId` and returns pre-joined data sets used across multiple reports, avoiding duplicate queries when multiple reports are on screen.

### Charts

All charts use Recharts. Common chart types: `BarChart`, `LineChart`, `PieChart`, `ComposedChart`. Chart data is derived from `useReportData` output.

### PDF Export

`src/lib/pdfExport.ts` handles rendering report content to a downloadable PDF. Reports with an export button call into this utility.

---

## Utilities & Hooks

### `src/lib/supabase.ts`

Exports a single `supabase` client instance initialized with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Import this singleton everywhere — never create additional client instances.

### `src/lib/database.types.ts`

Auto-generated TypeScript types from the Supabase schema. Provides the `Database` type and exports common type aliases (`CropType`, etc.).

To regenerate after schema changes:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
```

Then run `npm run typecheck` to catch any type mismatches.

### `src/lib/templateUtils.ts`

Central module for all template operations:

- `getTemplates(seasonId)` — fetch templates with computed stats
- `getTemplate(templateId)` — fetch a single template
- `createTemplate(data)` — create new template
- `updateTemplate(id, data)` — update template and trigger cascade
- `deleteTemplate(id)` — delete template
- `applyTemplateCascade(templateId, seasonId)` — propagate template changes to all linked fields
- `applyTemplateToField(fieldId, templateId)` — link and apply a template to one field
- `calculateTemplateCost(template)` — sum all cost columns to a total per acre
- `getFieldsUsingTemplate(templateId)` — list fields linked to a template

### `src/lib/backgroundTasks.ts`

Provides `setNotificationCallback(fn)` to register the toast notification function from outside React, and `notifyUser(message, type)` to fire a toast from async utility code. Also exports `triggerCascadeTask(taskId, session)` which calls the Edge Function.

### `src/lib/farms.ts`

- `fetchOwnedFarms(userId)` — returns all farms owned by the user
- `createFarm(userId, farmName)` — creates a new farm record
- `updateFarmName(farmId, name)` — renames a farm
- `deleteFarm(farmId)` — deletes a farm and all associated data

### `src/lib/teamMembers.ts`

- `fetchSharedFarms(userId)` — returns all farms the user has been invited to and accepted
- `inviteTeamMember(farmId, email, role)` — creates a `team_members` record
- `revokeTeamMember(memberId)` — sets status to `'revoked'`
- `fetchTeamMembers(farmId)` — lists accepted members for a farm

### `src/lib/seasonImport.ts`

Exports `importSeasonData(options)` which copies selected data categories from a source season to a new season, remapping all foreign key relationships.

### `src/lib/salesUtils.ts`

Formatting constants and helpers for commodity sales and hedges:

- `cropConfig` — display labels and colors per crop type
- `CONTRACT_TYPE_LABELS` — display labels for hedge contract types
- `formatDeliveryMonth`, `formatDate`, `formatCurrency`, `formatBushels` — display formatters

### `src/lib/unitConversions.ts`

Helper functions for converting between agricultural units (bags to seeds, lbs to tons, acres, etc.). Used in cost calculation displays.

### `src/lib/mathUtils.ts`

Shared numeric utility functions used across cost calculations and report data transformations.

### `src/lib/reportTypes.ts`

Shared TypeScript interfaces used across report pages and `useReportData`. Keeps report data shapes consistent and avoids type duplication.

### `src/lib/exportUtils.ts`

Helper functions for serializing data to CSV format for download.

### `src/lib/pdfExport.ts`

Generates PDF files from report data using browser print APIs.

### `src/lib/transactionUtils.ts`

Helpers for multi-step database operations that need to be treated as a unit. Wraps sequences of Supabase calls with error handling.

### `src/hooks/useSalesTracking.ts`

Custom hook that manages all state and CRUD operations for commodity sales and hedges for a given season. Returns `sales`, `hedges`, `loading`, `salesByCrop`, `hedgesByCrop`, and handler functions used by `SalesTracking`.

### `src/hooks/useCascadeTaskNotifications.ts`

Polls the `cascade_tasks` table for completed or errored tasks belonging to the current user and fires toast notifications via the notification bridge.

---

## Code Patterns & Conventions

### Supabase Queries

Always use `maybeSingle()` when expecting zero or one result. Use `single()` only when a missing row is a genuine error condition.

```typescript
const { data } = await supabase
  .from('user_profiles')
  .select('farm_name')
  .eq('id', user.id)
  .maybeSingle();
```

### Data Scoping

Never hardcode `user.id` in data queries when a farm context may be active. Use `effectiveUserId` from `FarmContext`:

```typescript
const { effectiveUserId } = useFarm();

const { data } = await supabase
  .from('fields')
  .select('*')
  .eq('season_id', seasonId)
  .eq('user_id', effectiveUserId);
```

### Read-Only Enforcement

Pages receive a `readOnly: boolean` prop. Use it to conditionally render action buttons and disable form inputs:

```tsx
{!readOnly && (
  <button onClick={handleSave}>Save</button>
)}
```

### Error Handling

Database errors from Supabase are surfaced to the user via `addNotification` from `NotificationContext`. Do not use `alert()` in new code. Prefer `if (error) throw error` in library functions and catch at the component boundary.

### Component File Size

Keep files focused. If a page component exceeds ~250 lines, extract sub-sections into separate component files in `src/components/`. Follow the existing pattern of co-locating related sub-components in the same folder.

### No External State Libraries

The project intentionally avoids Redux, Zustand, and similar libraries. Use React Context for cross-component state and `useState` / `useReducer` for local state.

---

## Known Issues & Technical Debt

### Console Logging in Production

Several files contain `console.log` and `console.error` calls that will appear in production browser consoles. These should be replaced with structured logging or removed before a public launch.

**Hotspots:** `src/lib/backgroundTasks.ts`, `src/lib/teamMembers.ts`, `src/pages/Products.tsx`

---

## Resolved Issues

The following issues were identified during a code review and have since been fixed.

### [Fixed] `(supabase as any)` Type Casts

`farms.ts`, `teamMembers.ts`, and `CrossFarmCopyModal.tsx` previously bypassed TypeScript type checking because the `farms` table and the `farm_id` column on `team_members` were absent from `database.types.ts`.

**Resolution:** `database.types.ts` was manually updated to add the `farms` table definition, correct `team_members.farm_id` (replacing the stale `season_id` field), add `farm_id` to the `seasons` type, and align `InvitationStatus` with the actual database enum. All `(supabase as any)` casts in `farms.ts`, `teamMembers.ts`, and `CrossFarmCopyModal.tsx` were replaced with properly typed Supabase client calls.

When schema changes are applied in future, regenerate types to keep them current:
```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
```

### [Fixed] Silent Failures on Data Load Errors

Previously, if `fetchOwnedFarms` rejected on initial load, or if `loadSeasonsByFarm` timed out or errored, the app silently fell back to empty state with no user-visible feedback.

**Resolution (`App.tsx`):**
- Added a `dataLoadError` state that is set whenever a critical load path fails
- When `fetchOwnedFarms` rejects, the error state is set and loading stops — the app does not silently continue with empty data
- When `loadSeasonsByFarm` throws (including on abort/timeout), the error state is set with a specific message
- A full-screen error banner with a "Try Again" button is rendered when `dataLoadError` is set and loading is complete
- The timeout duration is extracted to a named constant (`SEASON_LOAD_TIMEOUT_MS`)

### [Fixed] Cascade Task Partial Failures

Previously, the `process-cascade-task` Edge Function continued the field-update loop on errors, leaving the database in a partially-updated state with no indication of which fields had failed.

**Resolution:**
- The Edge Function now accumulates failed field IDs into a `failedFieldIds` array during the update loop
- After the loop, if any fields failed, the task `status` is set to `'partial'` instead of `'completed'`; the failed field IDs are stored in `result_data.failedFieldIds`
- The `useCascadeTaskNotifications` hook handles the `'partial'` status by showing a warning-level toast that names the count of fields that were not updated
- The `CascadeTaskRow` type in the hook was updated to include `'partial'` as a valid status value

### [Fixed] Missing Unique Constraint on `team_members`

The `team_members` table previously had no database-level guard against duplicate invitations, allowing the same email to be invited to the same farm multiple times.

**Resolution:**
- Migration `20260315003529_add_unique_constraint_team_members.sql` adds a partial unique index on `(user_id, farm_id, email)` where `status <> 'declined'`. This prevents duplicate active invitations while still allowing re-invitation after a previous invite was declined (which is the only terminal non-delete state in the enum).
- `sendInvitation()` in `teamMembers.ts` already performed an application-level check for existing pending/accepted records before inserting and catches Postgres error code `23505` (unique violation) to return a user-friendly message. The database index is now the authoritative safety net.
- The `sendInvitation` function signature was also updated to accept `ownerName`, `ownerEmail`, and `farmName` parameters so notification payloads are fully populated.

---

## Deployment

### Build

```bash
npm run build
```

Output goes to `dist/`. The build is a standard static site that can be served from any CDN or static host (Netlify, Vercel, Cloudflare Pages, etc.).

### Environment Variables

The production host must provide:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

These are embedded at build time by Vite. The anon key provides no elevated database access beyond what RLS policies permit and is safe to expose publicly.

### Supabase Project Setup

For a new Supabase project:

1. Create a project in the Supabase dashboard
2. Apply all migration files from `supabase/migrations/` in chronological filename order
3. Deploy the `process-cascade-task` Edge Function
4. Confirm RLS is enabled on all tables (the migrations handle this)
5. Copy the project URL and anon key to the host environment variables

### Edge Function Deployment

The `process-cascade-task` function is deployed via the Supabase MCP tools or CLI:

```bash
supabase functions deploy process-cascade-task
```

No additional secrets need to be configured — the function uses the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables that Supabase pre-populates automatically.

### Type Regeneration After Schema Changes

After applying new migrations, regenerate database types:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/database.types.ts
```

Then run `npm run typecheck` to catch any type mismatches introduced by the schema change.
