# SIT Pocket

A mobile-first launcher for the seven SIT services used most often on an iPhone. It is a static website with no analytics, no account storage, and no build step, so it is a good fit for GitHub Pages.

## Included shortcuts

| Shortcut | Destination |
| --- | --- |
| Outlook | Opens the Outlook iPhone app; falls back to its Singapore App Store page |
| in4SIT | `https://in4sit.singaporetech.edu.sg/` |
| xSiTe | `https://xsite.singaporetech.edu.sg/d2l/loginh/` |
| ReadyTalent | `https://readytalent2.singaporetech.edu.sg/` |
| RBS | `https://rbs.singaporetech.edu.sg/` |
| Campus Wayfinder | `https://www.singaporetech.edu.sg/campus-wayfinder` |
| MediHub | Runs an Apple Shortcut that opens Howden MediHub, with a separate Singapore App Store fallback |

The official destinations were checked on 17 August 2026.

## Publish with GitHub Pages

1. Sign in to GitHub and create a new **public** repository, for example `sit-pocket`.
2. Choose **Add file → Upload files**.
3. Upload everything inside this `sit-pocket` folder, keeping the `icons` folder intact, then commit the upload.
4. Open the repository's **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Select the `main` branch and `/ (root)`, then select **Save**.
7. After GitHub finishes publishing, open the Pages address it shows. It will usually look like `https://YOUR-USERNAME.github.io/sit-pocket/`.

## Add it to an iPhone

1. Open the published address in **Safari**.
2. Tap Safari's **Share** button.
3. Scroll down and choose **Add to Home Screen**.
4. Tap **Add**.

It then launches in its own app-style window. The launcher shell remains available offline, although each school portal still needs an internet connection.

## App-link note

Outlook publishes the `ms-outlook://` iPhone link used here. Howden MediHub does not register a working public launch scheme, so the launcher uses Apple's supported Shortcuts URL instead.

Create the MediHub shortcut once on the iPhone:

1. In Apple Shortcuts, create a new shortcut.
2. Add the **Open App** action and choose **Howden MediHub**.
3. Rename the shortcut exactly **Open MediHub** and save it.
4. Return to SIT Pocket and select **I've created it — Open MediHub** in the setup sheet.

The first tap on the **MediHub** card opens this setup sheet instead of the App Store. After setup, future taps run `shortcuts://run-shortcut?name=Open%20MediHub`. The **MediHub setup** link in the footer reopens the instructions, and the setup sheet keeps the verified App Store destination available separately.

## Updating a shortcut

All labels, descriptions, and destinations are in `index.html`. After changing one, commit the update to GitHub; GitHub Pages will republish automatically. If you change cached site files, also increase the `CACHE_NAME` version in `service-worker.js` so installed copies refresh promptly.
