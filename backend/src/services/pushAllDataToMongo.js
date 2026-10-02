/**
 * Migration & Sync Script: Push All Local Data to MongoDB Atlas
 * 
 * Imports:
 * 1. Portal datasets (allData.json, jobs.json, results.json, admitCards.json, trending.json, categories.json)
 * 2. Subscribers (subscribers.json)
 * 3. Tracked Jobs (trackedJobs.json)
 * 4. Sent Job History (sentJobHistory.json)
 * 5. Email Dispatch Logs (emailLogs.json)
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const {
  isMongoEnabled,
  getDb,
  saveAllPortalDataToMongo,
  saveCategorySummaryToMongo,
  upsertSubscriberInMongo,
  upsertTrackedJobInMongo,
  getMongoStatus
} = require('./mongoService');

const DATA_DIR = path.resolve(__dirname, '../data');

async function syncAllDataToMongo() {
  console.log('====================================================');
  console.log('Starting Full Data Migration to MongoDB Atlas...');
  console.log('====================================================');

  if (!isMongoEnabled()) {
    console.error('Error: MONGODB_URI is not set in backend/.env!');
    process.exit(1);
  }

  const db = await getDb();
  if (!db) {
    console.error('Error: Could not connect to MongoDB Atlas database!');
    process.exit(1);
  }

  const summary = {
    portalDatasets: {},
    subscribersCount: 0,
    trackedJobsCount: 0,
    historyCount: 0,
    logsCount: 0
  };

  // 1. Sync Portal Datasets (allData.json)
  const allDataFile = path.join(DATA_DIR, 'allData.json');
  try {
    const rawAll = await fs.readFile(allDataFile, 'utf-8');
    const allData = JSON.parse(rawAll);
    console.log('[Migration] Uploading scraped portal datasets to MongoDB...');
    const portalRes = await saveAllPortalDataToMongo(allData);
    summary.portalDatasets = portalRes;
    console.log('   Portal collections updated:');
    for (const [k, v] of Object.entries(portalRes || {})) {
      console.log(`     - ${k}: ${v?.inserted || 0} documents`);
    }
  } catch (err) {
    console.warn('[Migration] allData.json upload warning:', err.message);
  }

  // 1b. Sync Category Summary (categories.json)
  const categoriesFile = path.join(DATA_DIR, 'categories.json');
  try {
    const rawCat = await fs.readFile(categoriesFile, 'utf-8');
    const parsedCat = JSON.parse(rawCat);
    const catData = parsedCat.data || parsedCat;
    await saveCategorySummaryToMongo(catData);
    console.log('   Category summary metadata synced.');
  } catch (err) {
    console.warn('[Migration] categories.json upload warning:', err.message);
  }

  // 2. Sync Subscribers (subscribers.json)
  const subsFile = path.join(DATA_DIR, 'subscribers.json');
  try {
    const rawSubs = await fs.readFile(subsFile, 'utf-8');
    const parsedSubs = JSON.parse(rawSubs);
    const subsList = Array.isArray(parsedSubs) ? parsedSubs : (parsedSubs.subscribers || []);
    console.log(`\n[Migration] Syncing ${subsList.length} subscribers...`);
    let count = 0;
    for (const sub of subsList) {
      if (sub.email) {
        await upsertSubscriberInMongo(sub);
        count++;
      }
    }
    summary.subscribersCount = count;
    console.log(`   ${count} subscribers successfully upserted into Atlas.`);
  } catch (err) {
    console.warn('[Migration] subscribers.json upload warning:', err.message);
  }

  // 3. Sync Tracked Jobs (trackedJobs.json)
  const trackedFile = path.join(DATA_DIR, 'trackedJobs.json');
  try {
    const rawTracked = await fs.readFile(trackedFile, 'utf-8');
    const trackedList = JSON.parse(rawTracked);
    if (Array.isArray(trackedList)) {
      console.log(`\n[Migration] Syncing ${trackedList.length} tracked jobs...`);
      let count = 0;
      for (const track of trackedList) {
        if (track.email && (track.id || track.jobId || track.jobTitle)) {
          await upsertTrackedJobInMongo(track);
          count++;
        }
      }
      summary.trackedJobsCount = count;
      console.log(`   ${count} tracked jobs successfully upserted into Atlas.`);
    }
  } catch (err) {
    console.warn('[Migration] trackedJobs.json upload warning:', err.message);
  }

  // 4. Sync Sent Job History (sentJobHistory.json)
  const historyFile = path.join(DATA_DIR, 'sentJobHistory.json');
  try {
    const rawHist = await fs.readFile(historyFile, 'utf-8');
    const histMap = JSON.parse(rawHist);
    if (histMap && typeof histMap === 'object') {
      const emails = Object.keys(histMap);
      console.log(`\n[Migration] Syncing sent-job deduplication history for ${emails.length} candidates...`);
      let count = 0;
      for (const email of emails) {
        const item = histMap[email];
        if (item && email) {
          const cleanEmail = email.trim().toLowerCase();
          await db.collection('sent_job_history').updateOne(
            { email: cleanEmail },
            {
              $set: {
                email: cleanEmail,
                jobIds: item.jobIds || [],
                jobLinks: item.jobLinks || [],
                jobTitles: item.jobTitles || [],
                history: item.history || [],
                lastDispatchedAt: item.lastDispatchedAt || null
              }
            },
            { upsert: true }
          );
          count++;
        }
      }
      summary.historyCount = count;
      console.log(`   ${count} sent-history candidate profiles upserted into Atlas.`);
    }
  } catch (err) {
    console.warn('[Migration] sentJobHistory.json upload warning:', err.message);
  }

  // 5. Sync Email Logs (emailLogs.json)
  const logsFile = path.join(DATA_DIR, 'emailLogs.json');
  try {
    const rawLogs = await fs.readFile(logsFile, 'utf-8');
    const logsList = JSON.parse(rawLogs);
    if (Array.isArray(logsList) && logsList.length > 0) {
      console.log(`\n[Migration] Syncing ${logsList.length} email dispatch telemetry logs...`);
      const cleaned = logsList.map(l => {
        const doc = { ...l };
        delete doc._id;
        return doc;
      });
      // Replace existing logs with historical batch
      await db.collection('email_logs').deleteMany({});
      await db.collection('email_logs').insertMany(cleaned);
      summary.logsCount = cleaned.length;
      console.log(`   ${cleaned.length} email logs imported into Atlas.`);
    }
  } catch (err) {
    console.warn('[Migration] emailLogs.json upload warning:', err.message);
  }

  // 6. Final Status & Verification
  console.log('\n[Verification] Fetching live Atlas collection statistics...');
  const status = await getMongoStatus();
  console.log('Atlas Live Status:', JSON.stringify(status, null, 2));

  console.log('====================================================');
  console.log('Data Migration to MongoDB Atlas Completed Successfully!');
  console.log('====================================================\n');

  return { summary, status };
}

if (require.main === module) {
  syncAllDataToMongo().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

module.exports = {
  syncAllDataToMongo
};
