# Annual Intercultural Pastors Appreciation Dinner RSVP Website

Public RSVP website for the SoCal Network Assemblies of God Annual Intercultural Pastors Appreciation Dinner on Thursday, October 8, 2026, at Tandoor Cuisine of India in Orange, California.

## Technology

- HTML5, CSS3, and vanilla JavaScript
- Existing spreadsheet-bound Google Apps Script web app
- Existing legacy Google Form retained as a backup data source
- `clasp` for the local Apps Script source

## Registration data flow

The primary path is:

`Website RSVP -> Apps Script action=register -> Website Registrations`

The legacy path remains unchanged:

`Google Form -> Form Responses 1`

Apps Script creates `Website Registrations` automatically when a registration, private report, or dashboard refresh needs it. It adds missing expected headers at the end and never deletes or reorders existing rows. No manual sheet setup is required.

Number of Guests means additional guests and excludes the primary registrant. Total Attendees is always `1 + Number of Guests`. Website registrations support 0 through 10 required guest names.

## Public and private reports

The public GET endpoint keeps the existing aggregate contract:

```json
{
  "status": "ok",
  "registrations": 16,
  "attendees": 27
}
```

It combines legacy `Number Attending` totals with new website `Total Attendees` totals and returns no names, contact details, churches, timestamps, or guest names.

The Registration Report button in the top-right header uses the existing server-side organizer authentication. It requires the existing 30-minute Script Cache session and returns detailed contact and guest data only after authentication. The browser keeps only the temporary session token in `sessionStorage`; registration data is not stored in local storage.

Legacy records are marked `Legacy Google Form` and show `Not collected on legacy registration` for guest names. Church summaries group trimmed names case-insensitively and use `Unspecified` for blank organizations.

## Deadline and security

Registration is open through October 5, 2026 and closes at the start of October 6 in `America/Los_Angeles`. The cutoff is enforced in both the browser and Apps Script. Registration POSTs use URL-encoded parameters, a hidden honeypot, server-side validation, and a submission ID protected by a script lock for idempotency.

The organizer login ID is `socal`. Credentials remain server-side in Script Properties as a hash and are never included in public files or responses.

## Files

- `index.html`: event page, custom RSVP form, organizer dialog, and report containers.
- `styles.css`: responsive event styling, form controls, success state, and mobile report cards.
- `script.js`: guest-field rendering, RSVP submission, public aggregate loading, and authenticated report UI.
- `google-apps-script/Code.gs`: registration endpoint, normalized aggregation, private report, and dashboard refresh.
- `google-apps-script/appsscript.json`: Apps Script V8 manifest.

## Existing Apps Script deployment

The existing web app endpoint is configured in `script.js`. The local Apps Script project is the existing spreadsheet-bound project in `google-apps-script/`; do not create a new Apps Script project or deployment. `clasp push` updates source, and an existing deployment can be updated with the installed clasp command using its existing deployment ID.

The private Google Sheet `Dashboard` remains available as an owner-controlled backup and now summarizes both registration sources with `Total Attendees`.
