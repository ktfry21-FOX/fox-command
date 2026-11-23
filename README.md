# FOX 1195: GitHub and deployment

This package contains the app and its media, not a live database, employee roster, backup, or account credentials. Use a private, organization-approved repository and host if the app will contain employee information.

## Upload to GitHub

1. Unzip the download. Create a **Private** GitHub repository. If you already have one, check that it is private and that you are uploading to the intended branch.
2. Choose **Add file → Upload files**. Drag the extracted contents, including the `public` folder, to the repository root, then commit. Do not upload the ZIP itself. Make sure `Dockerfile`, `render.yaml`, and `server.mjs` appear at the root, not inside an extra folder. Include `.gitignore` and `.dockerignore` if your file picker hides dotfiles.
3. **Do not enable GitHub Pages.** Pages is static hosting. FOX needs a running Node.js server for authentication and SQLite. See [GitHub upload instructions](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository) and [how GitHub Pages works](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Deploy from GitHub

1. Generate your one-time activation code on your own device. In a terminal with Node.js, run the following line. It prints the code and its SHA-256 hash. Save the code in your password manager and do not commit either value to GitHub.

   ```sh
   node -e "const c=require('node:crypto');const k=c.randomBytes(32).toString('hex');console.log('Activation code: '+k);console.log('ALFRED_SETUP_KEY_HASH: '+c.createHash('sha256').update(k).digest('hex'))"
   ```

2. In [Render](https://dashboard.render.com/), choose **New → Blueprint** and connect the private repository. The included `render.yaml` sets up a Docker web service and a 1 GB persistent disk. Review the billed plan and disk before applying. Render persistent disks require a paid service; do not switch to an ephemeral free service for real records ([Render Blueprint reference](https://render.com/docs/blueprint-spec), [Render persistent disks](https://render.com/docs/disks)).
3. At the prompt, set `FOX_OWNER_EMAIL` to your email and paste only the **hash** into `ALFRED_SETUP_KEY_HASH`. Keep `FOX_HOSTED_RELEASE` set to `1` and the disk mounted at `/app/storage`, where `DATABASE_PATH` points. A missing or malformed owner configuration stops the server rather than allowing open registration.
4. Open the new service's **HTTPS** URL. Enter the configured email, select a unique manager passphrase of at least 16 characters, click **Create manager account**, and enter the original activation **code** when prompted. Save the manager passphrase separately. Email recovery is not configured. Activation cannot create another account after setup.
5. If you need records from the current FOX site, use its **System → Export** to save an encrypted backup privately, then use **System → Restore Backup** on the new app and supply the backup passphrase. Do not put the backup in GitHub, Docker, or the host's repository-linked files. The app export does not migrate the sign-in account or separate shift schedule settings; configure those on the new host. Review the restored roster and mark Team Leads in **Technician Profile → Edit profile details** if an older backup did not store their roles. Do not retire the original installation until you have confirmed that the records you need are present.
6. For the Home Screen app, open the new HTTPS address in Safari and use **Share → Add to Home Screen**. An icon installed from the old address will not move automatically.

## Privacy and operations

- **Repository privacy and site privacy are separate.** On the default Render web service, the URL and sign-in screen are reachable publicly; only the configured FOX owner can sign in. If the URL itself must be inaccessible to others, use an employer-approved private network or identity-aware gateway that protects every origin and cannot be bypassed via the default host URL. Do not import employee records into a deployment your organization has not approved.
- **Sessions:** Hosted FOX uses one-hour, revocable server sessions and does not persist the sign-in token in browser storage. A page reload requires sign-in. The API does not cache employee records in the service worker.
- **Throttling:** The Render configuration enables `FOX_TRUST_RENDER_EDGE` for its public ingress ([Render client-IP guidance](https://render.com/articles/host-pocketbase-on-render)). Leave that option off on other hosts or any deployment where requests can bypass Render's edge. On another host, configure rate limiting at your trusted gateway.
- **Database:** Run one instance with a persistent disk. The server does not provide its own database-at-rest encryption; use a host and storage policy that meet your requirements. Keep independent encrypted exports, since the disk is not a backup.
- **Existing site:** This package does not update or restrict the earlier `pplx.app` site. Set that site's visibility separately if you're keeping it available during migration.
