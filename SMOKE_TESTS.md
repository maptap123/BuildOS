# Manual Smoke Test Checklist

Run through this before each release or major deployment. Check off items as you go.

---

## Auth

- [ ] Unauthenticated visit to `/jobs` redirects to `/login`
- [ ] Login with valid credentials succeeds and lands on `/jobs`
- [ ] Login with wrong password shows an error message (no crash)
- [ ] Sign Out from the sidebar logs you out and redirects to `/login`
- [ ] Refreshing the page while logged in keeps the session (no redirect to login)

---

## All-Jobs Dashboard (`/jobs`)

- [ ] Dashboard loads without errors
- [ ] Date header shows today's date
- [ ] Active Jobs stat card shows a number (not 0 when jobs exist)
- [ ] Past Due panel loads — shows real tasks or "No overdue tasks"
- [ ] Due Today panel loads — shows real tasks or "Nothing due today"
- [ ] This Week panel loads — shows real schedule items or "Nothing scheduled this week"
- [ ] Team Activity panel loads — shows real daily logs or "No recent activity"
- [ ] Clicking a Past Due item navigates to the correct job's tasks page
- [ ] Clicking a This Week item navigates to the correct job's schedule page
- [ ] Clicking a Team Activity item navigates to the correct job's logs page

---

## Jobs Sidebar (Desktop)

- [ ] Job list loads and shows jobs
- [ ] Searching by job name filters the list in real time
- [ ] Filtering by status (Active / Lead / etc.) shows only matching jobs
- [ ] Filtering by Archived shows only archived jobs
- [ ] Clearing filters restores the full list
- [ ] Save Default saves the current filter (refreshing keeps it)
- [ ] Clicking a job navigates to that job's detail page
- [ ] New Job button opens the Add Job modal (if user has create permission)
- [ ] All Jobs link navigates to `/jobs` dashboard

---

## Add Job

- [ ] Opening Add Job modal shows the form
- [ ] Submitting with no job name shows a validation error
- [ ] Submitting with required fields creates the job and navigates to it
- [ ] New job appears in the sidebar list

---

## Edit Job

- [ ] Navigating to `/jobs/[id]/edit` loads the form with existing data pre-filled
- [ ] Changing job name and saving reflects the change on the detail page
- [ ] Changing status to Closed/Archived saves correctly
- [ ] Archive button sets job status to Archived and redirects to `/jobs`
- [ ] Archived job no longer appears in the default (no-filter) sidebar list
- [ ] Archived job appears when "Archived" filter is selected in the sidebar
- [ ] Delete button shows confirmation step before deleting
- [ ] Cancelling Delete confirmation leaves the job intact
- [ ] Delete on a job with no related records removes it and redirects to `/jobs`
- [ ] Delete on a job with related records returns an error (409), not a crash

---

## Job Detail (`/jobs/[id]`)

- [ ] Job info card shows address, client, dates, team
- [ ] Address link opens Google Maps
- [ ] Recent Logs card shows up to 3 logs or "No logs yet"
- [ ] Open Tasks card shows tasks or "No open tasks"
- [ ] This Week card shows schedule items active this week
- [ ] Budget Snapshot card is visible only if user has budget permission
- [ ] "View all →" links navigate to the correct sub-pages

---

## Tasks (`/jobs/[id]/tasks`)

- [ ] Task list loads for the job
- [ ] Adding a task creates it and it appears in the list
- [ ] Editing a task title saves correctly
- [ ] Changing task status marks it accordingly
- [ ] Marking a task done removes it from the open task view
- [ ] Adding a comment to a task saves and shows the comment

---

## Schedule (`/jobs/[id]/schedule`)

- [ ] Schedule items load for the job
- [ ] Adding a schedule item creates it
- [ ] Editing start/end dates saves correctly
- [ ] Setting percent complete shows the progress bar
- [ ] Predecessor relationship can be set and saved

---

## Budget (`/jobs/[id]/budget`)

- [ ] Budget lines load for the job
- [ ] Adding a budget line saves correctly
- [ ] Adding an actual cost saves and reflects in the line total
- [ ] Adding a change order saves and reflects in the summary
- [ ] Budget summary totals (budget, committed, variance) update when lines change
- [ ] Budget is hidden from users without budget `can_view` permission

---

## Daily Logs (`/jobs/[id]/logs`)

- [ ] Log list loads for the job
- [ ] Adding a new log saves and appears in the list
- [ ] Log shows date, author, work performed

---

## Admin (`/admin`)

- [ ] Admin page is accessible only to users with `admin` can_manage permission
- [ ] User list loads
- [ ] Invite user sends an invite (or shows placeholder if email not configured)
- [ ] Editing a user's permissions saves and takes effect on next API call

---

## Permissions (Role Checks)

- [ ] A user without `budget` can_view cannot see the budget page or budget data
- [ ] A user without `tasks` can_view sees "No task access" on the dashboard
- [ ] A user without `schedule` can_view sees "No schedule access" on the dashboard
- [ ] A user without `admin` can_manage cannot access `/admin`
- [ ] A user without `jobs` can_delete sees no Delete button on the edit page

---

## Mobile (375px viewport)

- [ ] Login page is usable on mobile
- [ ] Dashboard agenda panels stack vertically and are readable
- [ ] New Job button is visible at the top of the dashboard
- [ ] Job detail cards stack vertically
- [ ] Tasks, schedule, budget, log pages scroll correctly
- [ ] No horizontal overflow / broken layout on any main page

---

## AI (if ai permission is enabled)

- [ ] AI endpoint responds to a log summary request without error
- [ ] Agent endpoint responds to a natural language job query without error

---

## Build Check

- [ ] `npm run lint` passes with no errors
- [ ] `npm run build` completes with no TypeScript errors
