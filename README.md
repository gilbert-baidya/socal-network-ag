# Annual Intercultural Pastors Appreciation Dinner RSVP Website

## Project

Public event registration website for the **SoCal Network Assemblies of God Annual Intercultural Pastors Appreciation Dinner**.

The event is hosted by Intercultural Presbyters 4 & 5 on Thursday, October 8, 2026, at Tandoor Cuisine of India in Orange, California.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Google Forms for registration
- Google Sheets and Google Apps Script for the live attendance counter
- clasp CLI for local Apps Script development
- Netlify planned for later deployment

No framework, package manager, external library, database, API, or attendance service is used in Step 1.

## Files

- `index.html` contains the semantic page structure, event content, image references, and Google Form iframe.
- `styles.css` contains the mobile-first visual system, responsive layouts, accessibility states, and reduced-motion support.
- `script.js` contains the centralized registration cutoff state and the optional aggregate attendance fetch. Native anchor links provide smooth scrolling.
- `google-apps-script/Code.gs` is the Google Apps Script web endpoint for public aggregate totals and authenticated organizer aggregate reports.
- `google-apps-script/appsscript.json` is the V8 Apps Script manifest used by clasp.
- `socal-network-logo.png` is the supplied 500 x 500 SoCal Network logo.
- `Annual Intercultural Pastors Appriciation Dinne card.png` is the supplied 1080 x 1350 event poster.

## Local Development

Open `index.html` directly in a browser, or use the VS Code Live Server extension for a local server preview. No installation step is required.

## Google Form

Published form URL:

https://docs.google.com/forms/d/e/1FAIpQLSc9kzkzCOp3LEGZWpIb0BVPupW4dOy9AYtQWPXR6BqsrwkAlQ/viewform

Embedded URL used by the website:

https://docs.google.com/forms/d/e/1FAIpQLSc9kzkzCOp3LEGZWpIb0BVPupW4dOy9AYtQWPXR6BqsrwkAlQ/viewform?embedded=true

The Google Form remains responsible for Full Name, Phone Number, Email Address, Church or Organization, and Number Attending. No duplicate HTML registration fields are created here.

## Registration Deadline

Registration remains open through October 5, 2026 and is closed beginning October 6, 2026.

The editable cutoff is `REGISTRATION_CLOSE_DATE` near the top of `script.js`. The script uses the visitor's browser date. When closed, RSVP links are disabled, the iframe is hidden, and the closed-registration message is shown.

## Step 2 - Live Attendance Counter (Connected)

The attendance architecture is:

`Google Form -> Google Sheet -> Apps Script -> Website`

The connected response sheet is `Form Responses 1`. The attendance field is `Number Attending`. The Apps Script source is `google-apps-script/Code.gs`.

Attendance API:

https://script.google.com/macros/s/AKfycbwDfRTppas7K0JyGE0JsUYb72oSEKCcFPPQOlQZQwVhfM6HrY3SCZoh3DUekg7wVNzM/exec

The live flow is `Google Form -> Google Sheet -> Apps Script -> Website Expected Guests counter`. Only aggregate registration and attendee totals are public; personal registration data is never requested or displayed by the website.

### Setup

1. Open the connected Google Sheet.
2. Choose **Extensions -> Apps Script**.
3. Paste `google-apps-script/Code.gs` into `Code.gs` and save.
4. Run `testAttendanceData()`.
5. Approve authorization if prompted.
6. Check the execution log for the registration and attendee totals.
7. Choose **Deploy -> New deployment** and select **Web app**.
8. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
9. Deploy and copy the final URL ending in `/exec`.
10. The deployed URL is configured in `script.js` as `ATTENDANCE_API_URL`.
11. Reload the website.

The expected API shape is shown below. These values are examples only:

```json
{
	"status": "ok",
	"registrations": 16,
	"attendees": 27
}
```

The public endpoint exposes aggregate counts only. It never returns names, phone numbers, email addresses, churches, timestamps, individual rows, spreadsheet identifiers, or sheet contents. The Apps Script only reads the response sheet; it does not append, delete, sort, write formulas, modify responses, or change permissions.

Until the `/exec` URL is added, the website leaves the attendance widget in its neutral pending state and makes no request.

## Step 3 - Private Registration Dashboard

The private dashboard lives inside the existing Google Spreadsheet and is protected by Google Sheets sharing permissions. It is not a public website page and does not use a custom username/password system.

- Dashboard sheet: `Dashboard`
- Response sheet: `Form Responses 1`
- Public website: aggregate registration and expected guest totals only
- Private dashboard: grouped church or organization registrations and expected guests

The dashboard reads the response sheet without changing its rows, columns, headers, records, or formatting. It normalizes whitespace and letter case for grouping, uses `Unspecified` for blank church names, and sorts groups by expected guests, registrations, then church name.

### Dashboard functions

- `refreshPrivateDashboard()` creates or refreshes the private summary.
- `setupPrivateDashboard()` refreshes the summary and installs the form-submit trigger.
- `setupDashboardTrigger()` creates the installable trigger only when missing.
- `removeDashboardTrigger()` removes dashboard triggers for cleanup.
- `testPrivateDashboard()` refreshes the summary and logs aggregate totals only.

### First-time dashboard setup

1. From `google-apps-script/`, run `clasp push`.
2. Open the existing Apps Script project.
3. Run `setupPrivateDashboard()` and authorize if prompted.
4. Open the existing Google Spreadsheet and confirm the `Dashboard` tab exists.
5. Submit a test Google Form response.
6. Confirm the private Dashboard updates automatically.

Share the spreadsheet only with organizers who should see the dashboard. Use Viewer access for read-only organizers and Editor access only for trusted spreadsheet managers. No credentials are stored in website code, Apps Script, or public files.

## Step 4 - Website Organizer Access

The primary organizer experience is available from the public website through the secondary **View Registration Report** button near the RSVP section.

Architecture:

`Public Visitor -> RSVP Form`

`Public Counter -> aggregate GET API`

`Organizer -> Organizer Access -> server-side login -> temporary session -> private church-level aggregate report`

The organizer login ID is `socal`. The organizer password is initialized only on the server and stored as a SHA-256 hash in Apps Script Script Properties. It is never checked in browser JavaScript, returned through an API response, or documented here. Organizer sessions use Script Cache for 30 minutes, and the browser stores only the temporary session token in `sessionStorage`.

The private website report contains only total registrations, total expected guests, total churches represented, and church or organization names with registration and expected guest totals. It does not expose names, phone numbers, email addresses, timestamps, individual rows, spreadsheet URLs, spreadsheet IDs, or stored credential values. Organizers do not need Google Sheet or Google account access.

### Website organizer setup

1. Push the updated `google-apps-script/Code.gs` with `clasp push`.
2. Open the existing Apps Script project bound to the response spreadsheet.
3. Run `setupOrganizerCredentials()` once and approve authorization if prompted.
4. Run `testOrganizerReport()` to verify aggregate totals in the execution log.
5. Manually publish a new version of the existing Web App deployment so `doPost()` becomes available publicly.
6. Test login, report refresh, and logout from the website.

The Apps Script functions are:

- `setupOrganizerCredentials()` initializes the server-side login ID and password hash once.
- `testOrganizerReport()` logs aggregate totals only.
- `doPost(e)` routes `login`, `report`, and `logout` actions using form-encoded POST data.

The public `doGet()` contract remains unchanged and returns only `status`, `registrations`, and `attendees`. The existing private spreadsheet `Dashboard` tab remains available as an owner backup view.

The local source has been pushed, but the production Apps Script Web App deployment has not been updated. Organizer login is not live until the credentials are initialized, a new deployment version is published, and real login/report/logout requests are tested. Netlify has not been deployed.

## VS Code Development With clasp

Node.js 20 or later is required. This project was configured with Node.js 22.22.3 and the global `@google/clasp` package.

The repository ignores `.clasprc.json` and `.clasp.json`. Do not commit Google credentials, script IDs, or other clasp metadata.

### First-time setup

Run these commands manually from the project root:

```sh
clasp login
```

Open the existing response spreadsheet in Google Sheets, choose **Extensions > Apps Script**, and use that container-bound project. If the spreadsheet does not have a bound project yet, create it there; do not use `clasp create --type sheets`, because that command creates a new spreadsheet. Copy the Script ID from **Project Settings**.

Then attach the local Apps Script folder to that existing project:

```sh
cd google-apps-script
clasp clone EXISTING_SCRIPT_ID --rootDir .
```

Replace `EXISTING_SCRIPT_ID` with the Script ID from the target spreadsheet. Confirm that `.clasp.json` contains that Script ID and that `clasp status` lists only `Code.gs` and `appsscript.json` before running `clasp push`.

### Daily commands

Run these commands from `google-app-script/`:

```sh
clasp push
clasp pull
clasp open-script
clasp deployments
```

`clasp push` uploads the local `Code.gs` and `appsscript.json`. `clasp pull` downloads the connected Apps Script source. `clasp open-script` opens the connected project in the Apps Script editor. `clasp deployments` lists existing deployments. These commands do not deploy a new version by themselves.

After a successful push, the next deployment command is intentionally manual:

```sh
clasp deploy
```

Do not run that command until the code has been reviewed and the web app deployment settings are confirmed.

## Deployment

This static site is intended for free Netlify hosting later. Deployment has not been performed. Before deploying, add the production canonical URL, `og:url`, and `og:image` values in `index.html`.# socal-network-ag
