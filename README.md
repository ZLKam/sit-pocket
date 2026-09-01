# SIT Pocket web app

The iPhone home-screen app for SIT and DigiPen shortcuts. It also shows the next three lessons from a private read-only timetable feed and can hand that feed to Apple Calendar as a subscribed calendar.

The site is intentionally static and remains suitable for GitHub Pages. School passwords and the timetable write key never enter this website.

## Timetable experience

- The Chrome extension creates a private iPhone setup link after it syncs in4SIT.
- Opening that link imports only the sync-service address, calendar ID, and read key.
- The URL fragment is removed immediately after import, then the connection is saved in this device's local storage.
- The home page fetches the private JSON feed and shows the next three active or future lessons.
- The last successful response is cached locally so lessons remain visible when a refresh is unavailable.
- **Subscribe in Apple Calendar** opens the matching `webcal://` feed. Choose **iCloud** as the account in Apple's confirmation screen so it appears across devices. The subscription is read-only; the feed changes immediately after an extension sync, while Apple controls when Calendar refreshes it.
- Disconnecting removes the connection and cached timetable from the device.

Treat both the iPhone setup link and Apple Calendar subscription link as private: anyone with the embedded read key can view the timetable.

## Included shortcuts

### SIT

| Shortcut | Destination |
| --- | --- |
| Outlook | Opens the Outlook iPhone app; falls back to its Singapore App Store page |
| in4SIT | `https://in4sit.singaporetech.edu.sg/` |
| xSiTe | `https://xsite.singaporetech.edu.sg/d2l/loginh/` |
| ReadyTalent | `https://readytalent2.singaporetech.edu.sg/` |
| RBS | `https://rbs.singaporetech.edu.sg/` |
| Campus Wayfinder | `https://www.singaporetech.edu.sg/campus-wayfinder` |
| MediHub | Runs an Apple Shortcut that opens Howden MediHub, with a separate Singapore App Store fallback |

### DigiPen

| Shortcut | Destination |
| --- | --- |
| DRAMA | `https://drama.digipen.edu/` — DigiPen Resource & Account Management Application |
| Moodle | `https://distance3.sg.digipen.edu/` — choose **2026-Fall** |
| WebMail | `https://webmail.digipen.edu/roundcube/` |
| MS Teams | Opens the Microsoft Teams iPhone app; falls back to its Singapore App Store page |
| Attendance | `https://student-attendance.sg.digipen.edu/login` |

## Local check

The site has no build step. Serve this directory over HTTP and open it in a browser. Run the calendar logic tests with:

```text
npm test
```

The sync service permits the production GitHub Pages origin and the documented local preview origins. A local preview must use an allowed origin before it can fetch a live private feed.

## Publish with GitHub Pages

This repository is already configured as a static Pages site. Commit and push the files on `main`; GitHub Pages republishes automatically. When changing cached app-shell files, increase `CACHE_NAME` in `service-worker.js` so existing Home Screen installations update promptly.

## Add it to an iPhone

1. Open the published address in Safari.
2. Tap Safari's **Share** button.
3. Choose **Add to Home Screen**.
4. Tap **Add**.

The shell and last successfully fetched timetable remain available offline. School portals still require an internet connection.

## MediHub shortcut

Howden MediHub does not expose a working public app-launch address, so SIT Pocket uses an Apple Shortcut:

1. In Shortcuts, create a shortcut with the **Open App** action.
2. Select **Howden MediHub**.
3. Name the shortcut exactly **Open MediHub**.
4. Return to SIT Pocket and select **I've created it — Open MediHub**.

Future taps run `shortcuts://run-shortcut?name=Open%20MediHub`. The footer setup link keeps the instructions and App Store fallback available.
