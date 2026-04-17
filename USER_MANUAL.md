# Activity Report — User Manual

## What this app is for

**Activity Report** is a web application for logging professional activities: who attended, when the event happened, how long it lasted, details, related CRM information, and optional links to attachments. You sign in with your work email and password. Reports can be saved as **drafts** while you work, then **submitted** when complete. Managers can also see reports created by people in their reporting line, when those people are linked in the organization’s staff directory.

---

## Before you can use it

1. **Account** — You need a Firebase sign-in (email and password) issued by your administrator.
2. **Access list** — Your email must appear in the organization’s **staff** access database. If you can log in but see a message that you are not on the access list, contact your administrator.
3. **Browser** — Use a modern browser with JavaScript enabled. The app stores draft helpers in your browser’s **local storage** for the same device and browser profile.

---

## Signing in and out

### Log in

1. Open the app URL provided by your organization.
2. Enter your **email** and **password**.
3. Choose **Log in**.

If login fails, check that your email is correct and your password meets the minimum length (at least six characters). After too many failed attempts, you may need to wait before trying again.

### Log out

Use **Log out** in the header on the home screen, the create/edit screen, or the report view. This ends your session in this browser.

---

## Home screen (dashboard)

After a successful login, you see:

### Your information

- **Name** and **Email** — From the staff directory.
- **Team** — Your assigned team (or an identifier if no friendly name is set).
- **Role** — May show **Director** when your profile is marked as a director in the directory.

### Create Activity Report

Use **Create Activity Report** to open a new report form. Your own staff record is usually pre-selected under “Who is attending.”

### Activity reports

This section lists activity reports you are allowed to see:

- **Your own** reports (all statuses).
- **Reports from people who report to you** in the directory (when their Firebase accounts are linked to their staff emails).

Each row shows the **title** (or “Untitled activity”), **status**, **date/time created**, and **creator’s name**.

---

## Understanding statuses

| Label           | Meaning |
|----------------|--------|
| **Unsubmitted** | Draft — not yet submitted. You can continue editing your own drafts. |
| **Submitted**   | Finalized report. |
| **Deleted**     | Soft-deleted. Hidden from the list unless **Show deleted entries** is turned on. |

**Note:** For **your** unsubmitted drafts, clicking the row opens the **editor**. For submitted reports (and others’ drafts you can see), clicking opens the **read-only view**.

---

## Filtering and searching the list

### Creator’s team

Filters the list by the **team of the person who created the report** (from the staff directory), **not** the “Teams” dropdown used while filling out the form.

- Use the checkboxes to include or exclude teams.
- **Select all teams** resets the filter to include every team.

### Search

Narrows the list by matching text in (among other fields):

- Title  
- Detail  
- Creator name  
- Other party  
- CRM constituent number  
- Attachment URLs  

Search is simple text matching (not advanced query syntax).

### Show deleted entries

When checked, reports that were **soft-deleted** appear in the list (and may show a strikethrough-style treatment). When unchecked, deleted reports are hidden.

---

## Creating or editing a report

### Opening the form

- **New report:** **Create Activity Report** on the home screen, or go to `/activity/new`.
- **Continue a draft:** From the list, click an **Unsubmitted** report that **you** created — you are taken to the editor (`/activity/:id/edit`).

### Form fields (overview)

| Field | Purpose |
|-------|--------|
| **Activity Title** | Short label for the activity. |
| **Teams** | Narrows the **Who is attending** list to staff in one team, or **All teams**. |
| **Who is attending** | Check staff who participated. The list respects **Teams**; people you already selected stay visible if you change the team filter. Your own record often appears first. |
| **Other people** | Optional names for attendees not in the staff list. You can add or remove name rows. |
| **The other party’s name** | External contact or organization. |
| **CRM Constituent No (if any)** | Optional CRM reference. |
| **Event Date/Time** | When the activity occurred (local date/time picker). |
| **Duration** | Hours and minutes (duration must be greater than zero to **Submit**). |
| **Detail of the activity** | Main narrative (required to **Submit**). |
| **Attachment links (optional)** | URLs to documents or files stored elsewhere. Use **Add attachment link** for more rows; **Go to link** opens a URL in a new tab. |

### Save vs Submit

- **Save** — Stores a **draft** in the system (and caches form data in your browser). You can leave and come back. You will see a success message when the draft is saved.
- **Submit** — Finalizes the report. The app checks that **Event Date/Time**, **Detail**, and **Duration** (total minutes greater than zero) are set. After a successful submit, you return to the home screen. You cannot edit a submitted report through this form (draft-only editing).

### Delete draft (edit mode only)

On an **unsubmitted** draft you own, **Delete draft** soft-deletes the draft after you confirm. The draft disappears from the default list unless **Show deleted entries** is enabled.

---

## Viewing a report

Open a report from the list (or use a direct link to `/activity/:id` if you have permission).

- **Submitted** and **other people’s drafts** show read-only details.
- **Your own unsubmitted draft** automatically redirects to the **edit** page.

### Delete report (view mode)

If you **own** the report and it is **not** deleted, **Delete report** soft-deletes it after confirmation. Deleted reports behave like deleted drafts: hidden unless **Show deleted entries** is on.

You cannot delete someone else’s report from this app.

---

## Permissions in brief

- You always see **your** reports in the list (including drafts and deleted, subject to the deleted filter).
- You may see **reports created by your subordinates** when the system can match their staff emails to Firebase accounts.
- Opening a specific report by ID requires that you are allowed to see reports from that **creator** (yourself or a subordinate). Otherwise you see a **permission** error.

---

## Troubleshooting

| Message or situation | What to do |
|---------------------|------------|
| **Your account is not on the access list** | Ask your administrator to add your email to the staff access list. |
| **Access list database is not configured** (developers) | This is an environment setup issue — your IT team must configure the access Supabase connection. |
| **Configuration needed** on load | The app is missing Firebase or Supabase settings — contact the team that hosts the app. |
| Draft **won’t submit** | Set **Event Date/Time**, non-empty **Detail**, and **Duration** greater than zero. |
| **Incorrect email or password** | Reset password or verify credentials with your administrator. |
| List is empty | Clear **Search**, widen **Creator’s team**, enable **Show deleted entries** if you expect deleted items, or confirm that you or your team have created reports. |

---

## Privacy and data notes

- Reports are tied to your **Firebase user ID** and stored in the organization’s database according to their policies.
- **Attachment links** are stored as URLs only; files themselves are not uploaded by this screen unless your organization uses separate storage.

---

*This manual describes the application behavior as implemented in the Activity Report web app. Your organization may add policies or training beyond this document.*
