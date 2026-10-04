# Daily reminders at 7 PM IST

The Vercel cron in `vercel.json` uses `30 13 * * *` (13:30 UTC / 7 PM IST).
The local server's interval scheduler runs only while `node backend/server.js`
is running; it does not run automatically inside Vercel functions.

In the Vercel project's **Production** environment, configure:

- `MONGODB_URI` and `MONGODB_DB_NAME` for the database holding candidate records.
- `EMAIL_USER` and `EMAIL_APP_PASSWORD`, or `SMTP_USER`, `SMTP_PASS`, and `SMTP_HOST`.
- `CRON_SECRET`: a random secret of at least 16 characters. Vercel automatically
  adds `Authorization: Bearer <CRON_SECRET>` to its scheduled request.
- `PORTAL_URL`: `https://sarkari-result-wheat.vercel.app`.

Redeploy after changing environment variables or backend code. Check **Settings
→ Cron Jobs** to confirm the job is enabled, and inspect its invocation logs for
`/api/cron/reminders`. A 401 means the cron secret is missing or mismatched. A 500
means the batch failed; inspect the SMTP/database error. Failed recipients stay
pending, and the batch makes up to three attempts without resending recipients
already recorded as sent that day. SMTP acceptance does not prove inbox delivery;
check the sender's bounce messages and the recipient's spam folder as well.

Vercel Hobby cron has timing jitter within the scheduled hour and does not
guarantee 7:00 PM delivery. For minute-level scheduling, use a Vercel plan with
minute precision or an external scheduler calling the protected cron endpoint
at 13:30 UTC, with the same bearer secret and retry policy. Do not make the
endpoint public or use a browser timer for production reminders.

Read the affected record without sending email:

```powershell
node backend/src/services/notifications/diagnoseReminder.js https://sarkari-result-wheat.vercel.app/ anandsingh212004@gmail.com
```

The diagnostic reads `ADMIN_API_KEY` from the local environment and prints only
the selected recipient's reminder status. It does not change records.

References: [Vercel cron authentication, retries and timing](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
