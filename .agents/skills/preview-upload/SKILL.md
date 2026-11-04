---
name: preview-upload
description: Put a rig page on its public preview link (Cloudflare Pages) and later take the lane marker off it. Use for a plan's "Preview for review" and "Clean up" steps (ADR 0003).
---

# preview-upload

A preview is one HTML file of a rig page on a public HTTPS link that can be uploaded over
(ADR 0003). This repo uses Cloudflare Pages, project `rig-handover-digest`, link
https://rig-handover-digest-b17.pages.dev/. Uploads need `wrangler` signed in to the owner's
Cloudflare account (`npx wrangler login`, done by the human) and their yes before each upload.

## Save the page

1. `.env` has `LANE_MARKER=<marker>` for the review copy, or `LANE_MARKER=` for the clean copy.
   An empty variable in the shell does not override `.env`; change `.env` itself.
2. Make sure nothing else listens on the port, so the save comes from this code and this `.env`:
   `lsof -nP -iTCP:8787 -sTCP:LISTEN` must print nothing.
3. Start rig, save, stop it by its process id:

   ```sh
   pnpm start &
   curl -sf localhost:8787/digest/<night> -o ../preview/index.html
   lsof -t -nP -iTCP:8787 -sTCP:LISTEN | xargs kill
   ```

4. Check the file: `grep -c <marker>` is 1 for the review copy and 0 for the clean copy
   (banner "no marker set"). Keep the folder outside the repo: previews are never committed.

## Upload

```sh
npx wrangler pages deploy ../preview --project-name rig-handover-digest --branch main --commit-dirty=true
```

Then open the public link from outside wrangler (`curl -s <link>`) and compare it with the saved
file before sending it. A new project needed `wrangler pages project create <name>
--production-branch main --force` once: without `--force`, wrangler tries the Workers-based Pages
and fails when no workers.dev subdomain is set up.

## Clean up

Each upload also stays on its own link (`https://<id>.<project>.pages.dev`). After the clean copy is
up, delete every older upload that still shows the marker:

```sh
npx wrangler pages deployment list --project-name rig-handover-digest
npx wrangler pages deployment delete <id> --project-name rig-handover-digest --force
```

Done when the main link and every remaining upload link show no marker.
