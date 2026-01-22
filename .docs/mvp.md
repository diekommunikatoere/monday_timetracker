- einstellungen
  - benachrichtigungen (z.b. tägliche erinnerung)
  - themen (hell/dunkel)
- admin bereich (nur für bestimmte benutzer)
  - berichte generieren
  - rollen verwalten
  - system einstellungen

Timer größer
Kommentarfeld Pflicht für move down
edit time entry start und endzeit fehlt

# MVP TimeTracker App

## Terminology

- **`Job`**: An item on a Monday board representing a task or project which has subitems.
- **`Task`**: A subitem under a `Job`, representing a specific work unit that can be tracked for time. Only subitems are trackable.
- **`Order`**: A Monday item on the "Orders and Budgets" board representing a client order, which is connected to one or more `Jobs`.
- **`Time Entry`**: A record of time spent on a `Task`, which can be created (multiple per `Task`) and edited.
- **`Draft Entry`**: A `time entry` that is not yet finalized (IS_DRAFT column set to TRUE), allowing users to save progress without committing. There is always a timer session associated with a `Draft Entry` when the timer is running.
- **`Timer Session`**: The record of an active timer, linked to a `Draft Entry`, which tracks elapsed time until stopped.
- **`Timer Segment`**: A portion of time tracked during a `Timer Session`, which is created each time the timer is started or resumed. The total duration of a `Timer Session` is the sum of its `Timer Segment` durations.
- **`Timer`**: A tool to start, pause, and stop time tracking for a `Task`, which can create `Time Entries` or `Draft Entries` upon stopping.
- **`Sidebar-App`**: A compact application integrated into the sidebar of Monday.com for quick access to time tracking features. The sidebar contains the detailed information of items and subitems in monday boards. New tabs can be added to the sidebar app for additional functionality.
- **`Role`**: A designation assigned to users (e.g., "Graphic Designer", "Developer") that determines their hourly rate for billing purposes.

## Goals

### 1. Timetracking Dashboard (quick access)

- Display the current timer with "start/pause/stop/save as draft/save as `time entry`" functionality.
- Running timer visible at all times and synced via Supabase (real-time).
- Overview of today's `time entries`.
- Overview of all `draft entries`.
- Ability to manually enter time (via button which opens a manual time entry modal).
- "save as draft" is only available when a comment is provided (display error if not).
- Timer should be the prominent feature on the dashboard.
- Manual time entry and time entries overview are secondary features.

### 1.1 `Time Entry` Creation

- Starting a timer creates a `Draft Entry, Timer Session, and Timer Segment`.
- Pausing the timer stops the current `Timer Segment`.
- Resuming the timer creates a new `Timer Segment`.
- Active timer sessions can be saved as `Draft Entries` or finalized as `Time Entries`.
- "Saving as Draft Entry" stops the timer and keeps the entry as a draft. The timer is reset and a new `Timer Session` can be started.
- "Finalizing as Time Entry" stops the timer and converts the `Draft Entry` into a `Time Entry`. The timer is reset and a new `Timer Session` can be started.
- "Saving as Draft Entry" requires a comment; if none is provided, an error is shown.
- "Finalizing as Time Entry" opens a modal to confirm details (date, duration, project, task (subitem only), role, comment).
- Manually entering time creates a `Time Entry` directly, without a `Draft Entry` or `Timer Session`.

### 2. `Time Entry` Management Dashboard

- List all own `time entries`.
- Edit and delete existing `time entries`.
- Filter `time entries` by date, duration, project, job, and user.
- Search functionality for `time entries`.

### 3. Sidebar-App (for detailed management of jobs)

#### 3.1 `Job` View

- List all `Tasks` (subitems) under the selected `Job` (item).
- Show total tracked time for the `Job`.
- Show total cost for the `Job` based on `time entries` and their associated `roles`.
- Add new `time entries` to `Tasks`.
- Edit and delete existing own `time entries`.

#### 3.2 `Task` View

- Show all `time entries` associated with the selected `Task`.
- Edit and delete existing own `time entries`.

### 4. Admin Views

#### 4.1 Admin Settings(Monday.com admin settings)

- Role management (e.g. "Graphik", "Developer", "Manager").
- Should allow adding, editing, and deleting `roles`.
- Set hourly rates per `role`.
- Set non-billable `roles`.
- Select boards to connect columns for total tracked time and total cost.
- Manual sync option to update all connected columns.

#### 4.2 Admin Time Entry Management Dashboard

- List all `time entries` from all users.
- Edit and delete any `time entry`.
- Filter `time entries` by date, duration, project, job, order and user.
- Search functionality for `time entries`.
- Export `time entries` as CSV (selection export available).
- Batch delete `time entries`.
- Batch edit all allowed fields of `time entries`.

### 5. User Settings

- Set default `role` for new `time entries`.
- Set theme (light/dark).
- Set notification preferences (e.g., daily reminders to log time, stop running timer (after x hours)).
- Set preferred notification method (email, in-app).

### 6. Total tracked time column extension

- Add extension to existing "total tracked time" column to show a breakdown of time spent per `role` when clicked.
- Displays a detailed view of `time entries` associated with the `Job`, categorized by `role` and user.

### 7. Monday.com column interactions

- Update connected columns in Monday boards via the Monday.com API to reflect total tracked time and total cost based on `time entries`.
- Column: "Total Tracked Time" - shows the sum of all `time entries` for the `Tasks` of a `Job`.
- Column: "Total Cost" - calculates the total cost of the `Tasks` of a `Job` based on `time entries` and their associated hourly rates.
- Columns are updated whenever a `time entry` is saved, edited, or deleted.

### 8. Orders and Budgets board

- Column for special hourly rates per `order`.
- Column for total cost from all `jobs` linked to the `order`.
