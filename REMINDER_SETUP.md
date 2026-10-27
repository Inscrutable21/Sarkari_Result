# Automated Cron Jobs Guide (Vercel & Local)

## 1. Configured Cron Jobs in `vercel.json`

The project has two automated cron jobs configured in [`vercel.json`](file:///e:/Sarkari_Result/vercel.json):

| Cron Job Path | Schedule (UTC) | Local Time (IST) | Purpose |
|---|---|---|---|
| `/api/cron/scrape` | `0 1 * * *` | **6:30 AM IST** | Automated daily multi-platform crawl (Sarkari Result, Sarkari Radar, Context.dev) into MongoDB Atlas. |
| `/api/cron/reminders` | `30 13 * * *` | **7:00 PM IST** | Automated daily deadline countdown reminders & subscriber job alert digests. |

---

## 2. Why a Cron Job May Seem "Not Working" & Diagnosis

### Issue A: "Reminders cron ran, but dispatched 0 emails"
- **Cause**: If no candidates have subscribed to alerts or tracked any active application deadlines, the batch runs cleanly and returns `{"dispatched": 0}`.
- **Verification**: Run diagnostic to verify recipient records:
  ```powershell
  node backend/src/services/notifications/diagnoseReminder.js https://sarkari-result-wheat.vercel.app/ candidate@example.com
  ```

### Issue B: "HTTP 401 Unauthorized"
- **Cause**: Vercel Cron endpoints are protected. Direct browser visits without headers will return `401 Unauthorized`.
- **Fix**: When Vercel triggers the cron, it automatically passes `Authorization: Bearer <CRON_SECRET>`. Ensure `CRON_SECRET` is added to your Vercel Project Settings → Environment Variables.
- **Manual Test via Terminal**:
  ```powershell
  # Test Reminders Cron
  curl -H "Authorization: Bearer sarkari_cron_7a9f82d4e1b635c0882e34fa" https://sarkari-result-wheat.vercel.app/api/cron/reminders

  # Test Scraper Cron
  curl -H "Authorization: Bearer sarkari_cron_7a9f82d4e1b635c0882e34fa" https://sarkari-result-wheat.vercel.app/api/cron/scrape
  ```

### Issue C: "Local development scheduler didn't trigger"
- Vercel Cron only runs on the deployed Vercel cloud URL (`https://sarkari-result-wheat.vercel.app`).
- When running locally (`npm run dev`), the server uses an in-memory scheduler that checks every 30 seconds after 7:00 PM IST. If today's date has already executed, it skips duplicate runs. Use the Admin Dashboard button **"⚡ Run 7:00 PM Batch Now"** or **"⚡ Run Centralized Scraper"** to test immediately.

---

## 3. Required Vercel Environment Variables

In your Vercel Project Dashboard (**Settings → Environment Variables**), ensure:
- `MONGODB_URI`
- `EMAIL_USER` & `EMAIL_APP_PASSWORD`
- `CRON_SECRET`: Must match your secret (e.g. `sarkari_cron_7a9f82d4e1b635c0882e34fa`)
- `CONTEXT_DEV_API_KEY`: Context.dev API token
- `ADMIN_API_KEY`: Master administrator secret

References: [Vercel Cron Jobs Management](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
