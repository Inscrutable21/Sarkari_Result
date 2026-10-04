/**
 * MongoDB Atlas Service
 * Comprehensive persistent cloud database integration for Sarkari Hith.
 * 
 * Manages:
 * 1. Subscribers
 * 2. Tracked Jobs & Application Status
 * 3. Sent Job History (Candidate Deduplication)
 * 4. Email Dispatch Logs & Telemetry
 * 5. Scraped Portal Datasets (Jobs, Results, Admit Cards, Trending, Categories, All Data)
 */

const { MongoClient } = require('mongodb');
const { resolve } = require('node:path');
const { existsSync, readFileSync } = require('node:fs');

// Ensure local .env is loaded if running standalone scripts
(function ensureEnvLoaded() {
  if (!process.env.MONGODB_URI) {
    const envPath = resolve(__dirname, '../../.env');
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
          if (match) {
            let val = match[2] || '';
            val = val.trim().replace(/^['"](.*)['"]$/, '$1');
            if (!process.env[match[1]]) {
              process.env[match[1]] = val;
            }
          }
        });
      } catch { }
    }
  }
})();

const DB_NAME = process.env.MONGODB_DB_NAME || 'sarkari_hith';

// Global cache for connection pooling across Vercel Serverless Function invocations
let cachedClient = null;
let cachedPromise = null;
let indexesInitialized = false;

/**
 * Checks whether MongoDB Atlas URI is configured
 */
function isMongoEnabled() {
  return Boolean(process.env.MONGODB_URI && process.env.MONGODB_URI.startsWith('mongodb'));
}

/**
 * Returns a connected MongoClient instance (cached globally)
 */
async function getMongoClient() {
  if (!isMongoEnabled()) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  if (!cachedPromise) {
    const uri = process.env.MONGODB_URI;
    const client = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000
    });

    cachedPromise = client.connect().then(connectedClient => {
      cachedClient = connectedClient;
      return connectedClient;
    }).catch(err => {
      cachedPromise = null;
      throw err;
    });
  }

  return cachedPromise;
}

/**
 * Returns the target database instance
 */
async function getDb() {
  const client = await getMongoClient();
  if (!client) return null;
  const db = client.db(DB_NAME);

  if (!indexesInitialized) {
    ensureIndexes(db).catch(err => {
      console.warn('[MongoDB] Index setup notice:', err.message);
    });
    indexesInitialized = true;
  }

  return db;
}

/**
 * Creates essential indexes for high-speed queries and unique constraints
 */
async function ensureIndexes(db) {
  try {
    await Promise.all([
      db.collection('subscribers').createIndex({ email: 1 }, { unique: true }),
      db.collection('subscribers').createIndex({ active: 1 }),
      db.collection('tracked_jobs').createIndex({ id: 1 }, { unique: true }),
      db.collection('tracked_jobs').createIndex({ email: 1 }),
      db.collection('tracked_jobs').createIndex({ active: 1, applied: 1 }),
      db.collection('sent_job_history').createIndex({ email: 1 }, { unique: true }),
      db.collection('email_logs').createIndex({ timestamp: -1 }),
      db.collection('portal_jobs').createIndex({ id: 1 }),
      db.collection('portal_jobs').createIndex({ isActive: 1 }),
      db.collection('portal_results').createIndex({ id: 1 }),
      db.collection('portal_admit_cards').createIndex({ id: 1 }),
      db.collection('portal_trending').createIndex({ id: 1 })
    ]);
  } catch (err) {
    console.warn('[MongoDB] Index creation warning:', err.message);
  }
}

// ---------------------------------------------------------------------------
// 1. SUBSCRIBERS
// ---------------------------------------------------------------------------

async function getSubscribersFromMongo() {
  const db = await getDb();
  if (!db) return null;
  const docs = await db.collection('subscribers').find({}).toArray();
  return docs.map(doc => {
    const { _id, ...rest } = doc;
    return rest;
  });
}

async function upsertSubscriberInMongo(subscriber) {
  const db = await getDb();
  if (!db || !subscriber || !subscriber.email) return null;
  const cleanEmail = subscriber.email.trim().toLowerCase();
  const updateData = {
    ...subscriber,
    email: cleanEmail,
    updatedAt: new Date().toISOString()
  };
  delete updateData._id;

  return await db.collection('subscribers').updateOne(
    { email: cleanEmail },
    { $set: updateData },
    { upsert: true }
  );
}

async function unsubscribeUserInMongo(email) {
  const db = await getDb();
  if (!db || !email) return null;
  const cleanEmail = email.trim().toLowerCase();
  return await db.collection('subscribers').updateOne(
    { email: cleanEmail },
    {
      $set: {
        active: false,
        unsubscribedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }
  );
}

// ---------------------------------------------------------------------------
// 2. TRACKED JOBS (Deadline Countdown Reminders)
// ---------------------------------------------------------------------------

async function getTrackedJobsFromMongo(filterEmail = null) {
  const db = await getDb();
  if (!db) return null;
  const query = filterEmail ? { email: filterEmail.trim().toLowerCase() } : {};
  const docs = await db.collection('tracked_jobs').find(query).toArray();
  return docs.map(doc => {
    const { _id, ...rest } = doc;
    return rest;
  });
}

async function upsertTrackedJobInMongo(trackRecord) {
  const db = await getDb();
  if (!db || !trackRecord) return null;
  const cleanEmail = (trackRecord.email || '').trim().toLowerCase();
  const trackId = trackRecord.id;
  const updateData = {
    ...trackRecord,
    email: cleanEmail,
    updatedAt: new Date().toISOString()
  };
  delete updateData._id;

  if (trackId) {
    return await db.collection('tracked_jobs').updateOne(
      { id: trackId },
      { $set: updateData },
      { upsert: true }
    );
  }

  return await db.collection('tracked_jobs').updateOne(
    { email: cleanEmail, jobId: trackRecord.jobId },
    { $set: updateData },
    { upsert: true }
  );
}

async function updateTrackedJobStatusInMongo(trackId, status, extra = {}) {
  const db = await getDb();
  if (!db) return null;
  const isApplied = status === 'applied';
  const now = new Date().toISOString();
  const setFields = {
    applied: isApplied,
    active: !isApplied,
    appliedAt: isApplied ? now : null,
    statusUpdatedAt: now
  };

  if (trackId) {
    const res = await db.collection('tracked_jobs').updateOne(
      { id: trackId },
      { $set: setFields }
    );
    if (res.matchedCount > 0) return res;
  }

  // Fallback by email & job
  const cleanEmail = (extra.email || '').trim().toLowerCase();
  if (cleanEmail) {
    const filter = { email: cleanEmail };
    if (extra.jobId) filter.jobId = extra.jobId;
    else if (extra.jobTitle) filter.jobTitle = extra.jobTitle;
    return await db.collection('tracked_jobs').updateOne(
      filter,
      { $set: setFields }
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3. SENT JOB HISTORY (Deduplication Store)
// ---------------------------------------------------------------------------

async function getSentJobHistoryFromMongo() {
  const db = await getDb();
  if (!db) return null;
  const docs = await db.collection('sent_job_history').find({}).toArray();
  const historyMap = {};
  for (const doc of docs) {
    if (doc.email) {
      historyMap[doc.email.toLowerCase()] = {
        jobIds: doc.jobIds || [],
        jobLinks: doc.jobLinks || [],
        jobTitles: doc.jobTitles || [],
        history: doc.history || [],
        lastDispatchedAt: doc.lastDispatchedAt || null
      };
    }
  }
  return historyMap;
}

async function recordSentJobsInMongo(email, jobs) {
  const db = await getDb();
  if (!db || !email || !Array.isArray(jobs) || jobs.length === 0) return null;
  const cleanEmail = email.trim().toLowerCase();
  const nowIso = new Date().toISOString();

  const newIds = jobs.map(j => (j.id || '').trim()).filter(Boolean);
  const newLinks = jobs.map(j => (j.link || '').toLowerCase().trim()).filter(Boolean);
  const newTitles = jobs.map(j => (j.title || '').toLowerCase().trim()).filter(Boolean);
  const newHistoryEntries = jobs.map(j => ({
    id: j.id || '',
    title: j.title || '',
    link: j.link || '',
    organization: j.organization || '',
    sentAt: nowIso
  }));

  return await db.collection('sent_job_history').updateOne(
    { email: cleanEmail },
    {
      $addToSet: {
        jobIds: { $each: newIds },
        jobLinks: { $each: newLinks },
        jobTitles: { $each: newTitles }
      },
      $push: {
        history: {
          $each: newHistoryEntries,
          $slice: -500 // cap history at last 500 items
        }
      },
      $set: {
        lastDispatchedAt: nowIso,
        email: cleanEmail
      }
    },
    { upsert: true }
  );
}

// ---------------------------------------------------------------------------
// 4. EMAIL LOGS (Dispatch Telemetry & Analytics)
// ---------------------------------------------------------------------------

async function insertEmailLogIntoMongo(logEntry) {
  const db = await getDb();
  if (!db || !logEntry) return null;
  const doc = {
    ...logEntry,
    timestamp: logEntry.timestamp || new Date().toISOString(),
    createdAt: new Date()
  };
  delete doc._id;
  return await db.collection('email_logs').insertOne(doc);
}

async function getEmailLogsFromMongo(limit = 200) {
  const db = await getDb();
  if (!db) return null;
  const docs = await db.collection('email_logs')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
  return docs.map(d => {
    const { _id, ...rest } = d;
    return rest;
  });
}

// ---------------------------------------------------------------------------
// 5. PORTAL DATASETS (Jobs, Results, Admit Cards, Trending, Categories)
// ---------------------------------------------------------------------------

const COLLECTION_MAP = {
  jobs: 'portal_jobs',
  latestJobs: 'portal_jobs',
  results: 'portal_results',
  admitCards: 'portal_admit_cards',
  trending: 'portal_trending',
  answerKeys: 'portal_answer_keys',
  syllabus: 'portal_syllabus',
  admissions: 'portal_admissions',
  certificates: 'portal_certificates'
};

async function savePortalDatasetToMongo(datasetKey, items) {
  const db = await getDb();
  if (!db || !Array.isArray(items)) return null;
  const colName = COLLECTION_MAP[datasetKey] || `portal_${datasetKey.toLowerCase()}`;
  const col = db.collection(colName);

  // Clean objects to ensure valid Mongo documents
  const docs = items.map(it => {
    const doc = { ...it };
    delete doc._id;
    return doc;
  });

  // Atomic replace of the collection
  await col.deleteMany({});
  if (docs.length > 0) {
    await col.insertMany(docs);
  }
  return { collection: colName, inserted: docs.length };
}

async function getPortalDatasetFromMongo(datasetKey, query = {}) {
  const db = await getDb();
  if (!db) return null;
  const colName = COLLECTION_MAP[datasetKey] || `portal_${datasetKey.toLowerCase()}`;
  const docs = await db.collection(colName).find(query).toArray();
  return docs.map(doc => {
    const { _id, ...rest } = doc;
    return rest;
  });
}

async function saveAllPortalDataToMongo(allData) {
  const db = await getDb();
  if (!db || !allData) return null;

  const results = {};
  for (const [key, items] of Object.entries(allData)) {
    if (Array.isArray(items)) {
      results[key] = await savePortalDatasetToMongo(key, items);
    }
  }

  // Also save complete allData document and category summary
  await db.collection('portal_metadata').updateOne(
    { key: 'allData' },
    { $set: { key: 'allData', data: allData, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );

  return results;
}

async function getAllPortalDataFromMongo() {
  const db = await getDb();
  if (!db) return null;
  const doc = await db.collection('portal_metadata').findOne({ key: 'allData' });
  if (doc && doc.data) {
    return doc.data;
  }

  // Otherwise assemble from individual collections
  const [latestJobs, results, admitCards, trending] = await Promise.all([
    getPortalDatasetFromMongo('jobs'),
    getPortalDatasetFromMongo('results'),
    getPortalDatasetFromMongo('admitCards'),
    getPortalDatasetFromMongo('trending')
  ]);

  if ((latestJobs && latestJobs.length > 0) || (results && results.length > 0)) {
    return {
      latestJobs: latestJobs || [],
      results: results || [],
      admitCards: admitCards || [],
      trending: trending || []
    };
  }
  return null;
}

async function saveCategorySummaryToMongo(categorySummary) {
  const db = await getDb();
  if (!db || !categorySummary) return null;
  return await db.collection('portal_metadata').updateOne(
    { key: 'categories' },
    { $set: { key: 'categories', data: categorySummary, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
}

async function getCategorySummaryFromMongo() {
  const db = await getDb();
  if (!db) return null;
  const doc = await db.collection('portal_metadata').findOne({ key: 'categories' });
  return doc?.data || null;
}

// ---------------------------------------------------------------------------
// 6. HEALTH & METRICS
// ---------------------------------------------------------------------------

async function getMongoStatus() {
  const enabled = isMongoEnabled();
  if (!enabled) {
    return {
      enabled: false,
      configured: false,
      connected: false,
      message: 'MONGODB_URI is not configured in .env'
    };
  }

  const startTime = Date.now();
  try {
    const db = await getDb();
    if (!db) {
      return {
        enabled: true,
        configured: true,
        connected: false,
        error: 'Failed to obtain database handle'
      };
    }

    const pingRes = await db.command({ ping: 1 });
    const latencyMs = Date.now() - startTime;

    // Fetch counts from primary collections
    const [
      subsCount,
      trackedCount,
      logsCount,
      historyCount,
      jobsCount,
      resultsCount,
      admitCount
    ] = await Promise.all([
      db.collection('subscribers').countDocuments().catch(() => 0),
      db.collection('tracked_jobs').countDocuments().catch(() => 0),
      db.collection('email_logs').countDocuments().catch(() => 0),
      db.collection('sent_job_history').countDocuments().catch(() => 0),
      db.collection('portal_jobs').countDocuments().catch(() => 0),
      db.collection('portal_results').countDocuments().catch(() => 0),
      db.collection('portal_admit_cards').countDocuments().catch(() => 0)
    ]);

    return {
      enabled: true,
      configured: true,
      connected: pingRes.ok === 1,
      database: db.databaseName,
      latencyMs,
      counts: {
        subscribers: subsCount,
        trackedJobs: trackedCount,
        emailLogs: logsCount,
        sentJobHistory: historyCount,
        jobs: jobsCount,
        results: resultsCount,
        admitCards: admitCount
      }
    };
  } catch (err) {
    return {
      enabled: true,
      configured: true,
      connected: false,
      latencyMs: Date.now() - startTime,
      error: err.message
    };
  }
}

/**
 * Retrieves the last date string when the 7:00 PM daily batch reminder ran
 */
async function getLastReminderTriggerDateFromMongo() {
  const db = await getDb();
  if (!db) return null;
  try {
    const doc = await db.collection('system_metadata').findOne({ _id: 'daily_reminder_scheduler' });
    return doc ? doc.lastTriggerDate : null;
  } catch (err) {
    console.warn('[Mongo System Metadata] Could not read reminder trigger date:', err.message);
    return null;
  }
}

/**
 * Saves the last date string and execution telemetry for the 7:00 PM daily batch reminder
 */
async function setLastReminderTriggerDateInMongo(dateStr, meta = {}) {
  const db = await getDb();
  if (!db) return;
  try {
    await db.collection('system_metadata').updateOne(
      { _id: 'daily_reminder_scheduler' },
      {
        $set: {
          lastTriggerDate: dateStr,
          lastTriggerAt: new Date().toISOString(),
          meta,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn('[Mongo System Metadata] Could not persist reminder trigger date:', err.message);
  }
}

module.exports = {
  isMongoEnabled,
  getMongoClient,
  getDb,
  // Subscribers
  getSubscribersFromMongo,
  upsertSubscriberInMongo,
  unsubscribeUserInMongo,
  // Tracked Jobs
  getTrackedJobsFromMongo,
  upsertTrackedJobInMongo,
  updateTrackedJobStatusInMongo,
  // Sent Job History
  getSentJobHistoryFromMongo,
  recordSentJobsInMongo,
  // Email Logs
  insertEmailLogIntoMongo,
  getEmailLogsFromMongo,
  // Portal Datasets
  savePortalDatasetToMongo,
  getPortalDatasetFromMongo,
  saveAllPortalDataToMongo,
  getAllPortalDataFromMongo,
  saveCategorySummaryToMongo,
  getCategorySummaryFromMongo,
  // Status
  getMongoStatus,
  // Scheduler Telemetry
  getLastReminderTriggerDateFromMongo,
  setLastReminderTriggerDateInMongo
};
