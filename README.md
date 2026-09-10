# SIT Pocket

SIT Pocket is an iPhone-first Home Screen launcher for SIT and DigiPen services. It shows upcoming lessons, lets the device owner apply temporary timetable changes to the private feed, sends opt-in device notifications when lessons start, and publishes the same feed as a read-only Apple Calendar subscription.

- Website: <https://zlkam.github.io/sit-pocket/>
- Public website repository: <https://github.com/ZLKam/sit-pocket>
- Calendar-service health check: <https://sit-pocket-calendar-sync.sit-pocket-calendar-sync.workers.dev/health>

The complete development workspace is split into three parts. The public GitHub repository currently contains the static website at its root; in the complete workspace, that same website is kept in the `web` folder. The extension and calendar service remain companion components.

| Folder | Purpose |
| --- | --- |
| `web` | Static GitHub Pages website and iPhone Home Screen app |
| `extension` | Desktop Chrome/Edge extension that reads the signed-in in4SIT timetable |
| `calendar-sync` | Private Cloudflare Worker and KV feed used by the website and Apple Calendar |

## How it works

```text
in4SIT in desktop Chrome/Edge
        |
        | SIT Pocket Timetable Sync extension
        v
Private Cloudflare Worker + KV + one-minute scheduler
        |                         |                         |
        | protected JSON/edit API | protected iCalendar feed| encrypted Web Push
        v                         v                         v
SIT Pocket lessons + editor      Apple Calendar subscription iPhone check-in reminder
```

The extension uploads normalized lesson and exam events. It does not receive an Apple Account password, and it never reads or uploads the in4SIT password. The iPhone receives separate private read and edit keys; the more powerful full-timetable write key remains in desktop extension storage.

## Requirements

- A Windows, macOS, or Linux computer with desktop Chrome or Edge
- Node.js 18 or newer and npm
- A GitHub account with GitHub Pages enabled for the website repository
- A Cloudflare account with Workers and KV access
- An iPhone with iOS 16.4 or newer, Safari, Shortcuts, Calendar, and an iCloud account
- Access to in4SIT lesson and exam timetable pages

## Complete first-time setup

Existing installations that already use the subscribed calendar should complete the short upgrade block in step 2, rebuild/reload the extension, and open one fresh iPhone setup link. The calendar ID and read token stay unchanged.

The command examples use paths relative to the complete workspace root: the directory containing `web`, `extension`, and `calendar-sync`. Start each numbered component section from that root, stay inside the selected component while completing the section, and run `cd ..` before moving to another component. If only the public website repository was cloned, it already represents the `web` component, so skip the first `cd web` command.

### 1. Publish the static website

The `web` folder has no build step. Its files are served directly by GitHub Pages.

```powershell
# Skip this line when working directly in a clone of the public website repository.
cd web
npm test
git push origin main
```

In the GitHub repository, open **Settings → Pages** and publish the `main` branch from the repository root. Confirm that the site opens over HTTPS before configuring the extension.

This project's published address is:

```text
https://zlkam.github.io/sit-pocket/
```

### 2. Create and deploy the private calendar service

Install the Worker dependencies:

```powershell
cd calendar-sync
npm install
```

Generate the private calendar, edit, and Web Push credentials without printing them to the terminal:

```powershell
node scripts/generate-secrets.mjs --write
```

This creates the ignored file `calendar-sync/.dev.vars`:

```text
CALENDAR_ID=private-calendar-id
READ_TOKEN=private-read-token
WRITE_TOKEN=private-write-token
EDIT_TOKEN=private-edit-token
VAPID_PUBLIC_KEY=public-web-push-key
VAPID_PRIVATE_KEY=private-web-push-key
VAPID_SUBJECT=https://your-public-site.example/
```

Never commit, paste, or share this file.

`VAPID_SUBJECT` must be an HTTPS or `mailto:` contact URI. The generator defaults to this project's hosted SIT Pocket address; change that one value to the fork owner's public site/contact before deploying a separate fork.

Create the deploy configuration:

```powershell
Copy-Item wrangler.example.jsonc wrangler.jsonc
npx wrangler login
npx wrangler kv namespace create TIMETABLES
```

On macOS or Linux, use `cp wrangler.example.jsonc wrangler.jsonc` instead of `Copy-Item`.

Copy the returned KV namespace ID into the `TIMETABLES` entry in `wrangler.jsonc`. Create a separate preview namespace only if one is needed; otherwise remove the example `preview_id` line.

For a new Cloudflare Workers account, first choose the account's `workers.dev` subdomain in **Workers & Pages → Your subdomain** in the Cloudflare dashboard.

The included cron trigger checks once per minute for lessons that have just started. Deploy the Worker and all seven values together:

```powershell
npx wrangler deploy --config wrangler.jsonc --secrets-file .dev.vars
```

Open the deployed health endpoint. It is ready when `configured`, `editingConfigured`, and `notificationsConfigured` are all `true`.

Your service address will follow this pattern:

```text
https://<worker-name>.<account-subdomain>.workers.dev
```

Do not reuse another person's Worker address or keys. Every installation should deploy its own private Worker. The service used by the hosted SIT Pocket instance is shown later only as a project reference.

For an existing three-key deployment, preserve the current calendar ID/read/write values and add only the missing edit and notification values:

```powershell
node scripts/generate-secrets.mjs --upgrade
npx wrangler deploy --config wrangler.jsonc --secrets-file .dev.vars
```

This keeps the existing Apple Calendar subscription address valid. The upgrade command does not print or rotate existing keys.

### 3. Build and load the edited timetable extension

Build and verify the extension:

```powershell
cd extension
npm install
npm test
npm run typecheck
npm run build
```

Load it into Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the generated `extension/dist/chromium` folder.

For Edge, use `edge://extensions` and the same unpacked folder. The extension runs on desktop only; it is not installed on the iPhone.

After rebuilding the extension later, return to the extensions page and press **Reload** on **SIT Pocket Timetable Sync**.

### 4. Connect the extension to the Worker

Sign in to in4SIT, then open **My Class Schedule**. A **Calendar sync** panel appears in the lower-right corner.

Enter:

| Extension field | Value |
| --- | --- |
| Sync service address | The Worker origin only, without `/health` or `/v1/...` |
| Calendar ID | `CALENDAR_ID` from `calendar-sync/.dev.vars` |
| Write key | `WRITE_TOKEN` from `calendar-sync/.dev.vars` |
| Read key | `READ_TOKEN` from `calendar-sync/.dev.vars` |
| Edit key | `EDIT_TOKEN` from `calendar-sync/.dev.vars` |
| SIT Pocket address | The published GitHub Pages address |

For the hosted instance maintained by this project, the two public addresses are:

```text
Sync service: https://sit-pocket-calendar-sync.sit-pocket-calendar-sync.workers.dev
SIT Pocket:   https://zlkam.github.io/sit-pocket/
```

Choose **Save connection**, followed by **Sync lesson timetable**.

Next, open **View My Exam Timetable** and choose **Sync exam timetable**. Lesson and exam syncs update their own portions of the feed, so running one does not erase the other.

### 5. Connect the iPhone

After a successful desktop sync:

1. Choose **Copy iPhone setup link** in the extension.
2. Send the link privately to the iPhone, for example with AirDrop or a private note.
3. Open the link in Safari.
4. SIT Pocket imports the private read/edit connection and immediately removes it from the visible address bar.
5. Confirm that **Up next** shows the upcoming lessons.
6. Choose **Subscribe in Apple Calendar**.
7. In Apple's confirmation screen, select **iCloud** as the account and confirm the subscription.

The Apple subscription itself is read-only. Manual changes made in SIT Pocket update the underlying private feed, so they also appear after Apple next refreshes the subscription. A desktop extension sync updates the Worker immediately, but Apple controls the Calendar refresh interval.

### 6. Add SIT Pocket to the iPhone Home Screen

1. Open the published website in Safari.
2. Tap Safari's **Share** button.
3. Choose **Add to Home Screen**.
4. Keep **Open as Web App** enabled if that option appears.
5. Tap **Add**.

Open the new SIT Pocket icon from the Home Screen. The app shell and the last successfully fetched timetable remain available offline; school portals still require an internet connection.

### Enable class check-in notifications

Apple supports Web Push for iPhone Home Screen web apps on iOS 16.4 or newer. Permission must be requested from a button press inside the installed app:

1. Open SIT Pocket from its Home Screen icon, not from a normal Safari tab.
2. Choose **Manage** beside **Up next**.
3. Choose **Enable check-in notifications**.
4. Select **Allow** in the iPhone notification prompt.

The private Worker checks once per minute. When a lesson starts, the device receives one **Class starting — check in** notification for that event and start time. Tap the notification to open the DigiPen Attendance login page. Exams and manually cancelled events do not trigger reminders. Delivery can be delayed or suppressed by device connectivity, Focus settings, or notification settings.

## Everyday use

### Update the timetable

Whenever the school timetable changes:

1. Open the relevant in4SIT lesson or exam timetable on the desktop.
2. Press the matching sync button in the extension panel.
3. Open SIT Pocket and press **Refresh** if the new events are not already visible.

There is no need to subscribe in Apple Calendar again unless the read key or calendar ID changes.

### Manually change a timetable event

Use a manual override for a sudden room/time change or cancellation before in4SIT has caught up:

1. Open SIT Pocket and choose **Manage** beside **Up next**.
2. Choose **Edit timetable events**.
3. Select the event.
4. Change its title, Singapore start/end time, location, or **Mark this event as cancelled**.
5. Choose **Save manual change**.

The change updates **Up next** immediately and the same iCalendar feed used by Apple Calendar. Apple decides when its app refreshes a subscribed calendar, so SIT Pocket may show the change first.

Manual fields survive ordinary desktop syncs. Choose **Restore synced details** to remove the override and return to the most recent in4SIT values. If a later in4SIT sync removes/replaces the original source event, the now-orphaned override is discarded automatically.

### Turn check-in notifications off

Open **Manage** and choose **Check-in notifications on**. SIT Pocket removes the device subscription and unsubscribes that browser endpoint. Disconnecting the timetable also turns off its notification subscription on that device.

### Show or hide shortcut sections

The **SIT essentials** and **DigiPen essentials** headings each have an **On/Off** switch.

- **Off** hides that section's shortcut cards.
- The compact section heading remains visible so the section can always be turned back on.
- The choices are stored on that device only.
- Clearing Safari website data resets both sections to **On**.

### Set up MediHub

MediHub does not provide a reliable public app-launch link, so SIT Pocket runs an Apple Shortcut:

1. Open Apple's **Shortcuts** app.
2. Create a new shortcut.
3. Add the **Open App** action.
4. Select **Howden MediHub**.
5. Name the shortcut exactly **Open MediHub**.
6. In SIT Pocket, open **MediHub setup** and choose **I've created it — Open MediHub**.

Future MediHub card taps run the shortcut. The setup sheet also keeps the Singapore App Store fallback available.

### App launchers

- Outlook uses `ms-outlook://` and falls back to the Singapore App Store.
- Microsoft Teams uses `msteams://` and falls back to the Singapore App Store.
- MediHub uses the `Open MediHub` Apple Shortcut.
- The remaining services open their official websites.

## Included services

### SIT essentials

| Service | Purpose |
| --- | --- |
| Outlook | SIT email and calendar |
| in4SIT | Timetable, results, events, LOA/MC submissions, and forms |
| xSiTe | Module slides, tutorials, and labs |
| ReadyTalent | Student jobs, internships, attachments, and IWSP |
| RBS | Discussion rooms and sports-facility bookings |
| Wayfinder | Punggol Campus navigation |
| MediHub | Medical e-card, clinics, and claims through Apple Shortcuts |

### DigiPen essentials

| Service | Purpose |
| --- | --- |
| DRAMA | DigiPen Resource & Account Management Application |
| Moodle | Learning Management System; choose the required semester such as `2026-Fall` |
| WebMail | DigiPen Roundcube email |
| MS Teams | Online lectures and meetings |
| Attendance | Class check-in and attendance |

## Updating the project

### Website

Run the tests before publishing:

```powershell
cd web
npm test
```

The optional mobile QA script also checks 320 px, 390 px, tablet, offline, connected-calendar, Home Screen, and section-toggle behavior when Playwright is available:

```powershell
node qa/visual-check.mjs
```

When changing `index.html`, `styles.css`, `app.js`, or other cached app-shell files:

1. Update the matching query string in `index.html` and `service-worker.js`.
2. Increase `CACHE_NAME` in `service-worker.js`.
3. Test the normal Safari page and the installed Home Screen app.
4. Commit and push through the normal GitHub review flow.

### Extension

```powershell
cd extension
npm test
npm run typecheck
npm run build
```

Reload the unpacked extension after every production build.

### Calendar service

```powershell
cd calendar-sync
npm test
npm run check
npm run build
npx wrangler deploy --config wrangler.jsonc --secrets-file .dev.vars
```

Verify `/health` after every deployment. Do not deploy without `--secrets-file .dev.vars` unless all calendar/edit/push values are already confirmed in the Cloudflare environment. Existing pre-notification deployments should run `node scripts/generate-secrets.mjs --upgrade` once before deploying.

## Privacy and key safety

- `WRITE_TOKEN` can replace timetable data. It belongs only in the desktop extension and Cloudflare Worker secrets.
- `READ_TOKEN` can view the private feed. It is included in the iPhone setup link and Apple subscription URL.
- `EDIT_TOKEN` can change individual events and register/remove notification devices. It is included in the private iPhone setup link but not in the Apple subscription URL.
- `VAPID_PRIVATE_KEY` signs encrypted Web Push deliveries and belongs only in Worker secrets. `VAPID_PUBLIC_KEY` is intentionally given to the connected browser.
- `CALENDAR_ID` identifies the private feed and should also be treated as private.
- The website stores the read/edit connection and latest successful feed in browser local storage.
- The extension stores its connection in Chrome extension storage.
- The Worker stores manual overrides plus each opted-in browser's push endpoint/public encryption keys and delivery-deduplication markers. It does not receive the device's phone number or Apple Account.
- Notification text can include a lesson title and room on the Lock Screen; control preview visibility in iPhone notification settings.
- The project never asks for an Apple Account password, iCloud app-specific password, or school password.
- Never commit `.dev.vars`, `wrangler.jsonc`, setup links, subscription URLs, or screenshots containing keys.

If a setup or subscription link is exposed:

1. Move the existing `.dev.vars` to a private backup location.
2. Generate replacement values with `node scripts/generate-secrets.mjs --write`; do not use `--upgrade`, which intentionally preserves existing values.
3. Redeploy the Worker with the replacement secrets.
4. Update the extension connection and sync both timetable scopes again.
5. Reconnect SIT Pocket on the iPhone.
6. Remove the old Apple Calendar subscription and subscribe to the replacement feed.

## Troubleshooting

### The extension panel is missing

- Confirm **SIT Pocket Timetable Sync** is enabled in `chrome://extensions`.
- Reload in4SIT after loading or reloading the extension.
- Open **My Class Schedule** or **View My Exam Timetable**; the sync action is available only when the matching timetable is present.

### Sync returns 401 or unauthorized

The Calendar ID or write key in the extension does not match the currently deployed Worker secrets. Re-enter the values from the private `.dev.vars` file and save the connection.

### Editing or notification setup returns 401

The iPhone has an old or mismatched edit key. Rebuild/reload the extension, enter the current `EDIT_TOKEN`, copy a fresh iPhone setup link, and open it on the same iPhone. The calendar ID/read token can stay unchanged, so the Apple subscription does not need to be recreated.

### The notification button says to use the Home Screen app

On iPhone, notification permission is available to installed Home Screen web apps on iOS 16.4 or newer. Add SIT Pocket to the Home Screen, keep **Open as Web App** enabled if shown, launch that icon, and press the notification button again.

### A class-start notification did not arrive

- Confirm **Check-in notifications on** appears under **Manage**.
- Confirm the event is a lesson, is not cancelled, and has the correct Singapore start time.
- Check iPhone **Settings → Notifications → SIT Pocket** and any active Focus mode.
- Confirm the phone had network access around the lesson start.
- Confirm the Worker health response shows `notificationsConfigured: true` and its minute cron trigger is present.

### The feed returns 404

A valid timetable has not yet been uploaded for that Calendar ID. Sync the lesson or exam timetable from in4SIT first.

### Upcoming lessons show cached or old data

- Press **Refresh** in SIT Pocket.
- Confirm the desktop extension reported a successful sync.
- Confirm the Worker health endpoint reports `configured: true`.
- If the website says refresh is unavailable, it is intentionally showing the last successful offline copy.

### Apple Calendar has not updated yet

Confirm that SIT Pocket itself shows the new events. If it does, the Worker is current and Apple Calendar is waiting for its next subscribed-calendar refresh. Apple controls that refresh interval.

### A hidden section stays hidden

Use the **Off** switch beside the section heading to turn it back **On**. If the preference appears stuck, clear the site's Safari website data; this also removes the saved timetable connection, so keep the private setup link available before doing so.

### The Home Screen app looks outdated

Close and reopen SIT Pocket while online. If a deployment changed cached files, confirm that the service-worker cache name was increased. Removing and re-adding the Home Screen icon is a last resort because it may also require reconnecting the timetable.

## Attribution

The timetable extraction approach is adapted from the MIT-licensed [SIT Timetable Grabber Extension](https://github.com/ekiost/SIT-Timetable-Grabber-Extension) by Ling Choon Keat. The original extension license is retained in the `extension` folder.
