/**
 * Authentication & Tokenization Service
 * Provides cryptographic token generation, rotation, hashing, and session management in MongoDB Atlas.
 */

const crypto = require('node:crypto');
const { getDb } = require('./mongoService');

// Derived secret for HMAC signing of tokens
const MASTER_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_API_KEY || 'sarkari_hith_fallback_master_secret_2026';
const TOKEN_EXPIRY_HOURS = 12;

/**
 * Generates a cryptographic salt and password hash using scrypt
 */
function hashPassword(password, existingSalt = null) {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return {
    salt,
    hash: derivedKey.toString('hex')
  };
}

/**
 * Timing-safe password verification
 */
function verifyPassword(password, salt, storedHash) {
  const { hash } = hashPassword(password, salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const storedBuf = Buffer.from(storedHash, 'hex');
  if (hashBuf.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, storedBuf);
}

/**
 * Hashes a token for secure database storage (prevents raw token leaks if DB compromised)
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a signed cryptographic token string
 */
function createSignedToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', MASTER_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verifies a signed cryptographic token string
 */
function verifySignedToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', MASTER_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() >= payload.exp) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Checks whether at least one admin account is registered in MongoDB
 */
async function isAdminRegistered() {
  try {
    const db = await getDb();
    if (!db) return false;
    const count = await db.collection('admin_users').countDocuments({});
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Registers an admin user account in MongoDB Atlas
 */
async function registerAdmin(username, password, masterKey = '') {
  if (!username || username.trim().length < 3) {
    throw new Error('Username must be at least 3 characters long');
  }
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  const db = await getDb();
  if (!db) throw new Error('Database connection unavailable');

  const existingCount = await db.collection('admin_users').countDocuments({});
  // If an admin already exists, require the valid master key to register a new admin
  if (existingCount > 0) {
    const expectedMasterKey = process.env.ADMIN_API_KEY;
    if (!expectedMasterKey || masterKey !== expectedMasterKey) {
      throw new Error('Master Authorization Key is required to register an additional administrator');
    }
  }

  const normalizedUser = username.trim().toLowerCase();
  const existingUser = await db.collection('admin_users').findOne({ username: normalizedUser });
  if (existingUser) {
    throw new Error(`Username "${username}" is already registered`);
  }

  const { salt, hash } = hashPassword(password);
  const adminDoc = {
    username: normalizedUser,
    displayName: username.trim(),
    passwordHash: hash,
    salt,
    role: existingCount === 0 ? 'superadmin' : 'admin',
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  const result = await db.collection('admin_users').insertOne(adminDoc);
  const session = await createSession(result.insertedId.toString(), normalizedUser, 'initial_registration');

  return {
    success: true,
    message: 'Admin account registered successfully',
    admin: {
      id: result.insertedId.toString(),
      username: adminDoc.displayName,
      role: adminDoc.role
    },
    ...session
  };
}

/**
 * Authenticates admin credentials and issues a fresh session token
 */
async function loginWithCredentials(username, password, clientMeta = {}) {
  const db = await getDb();
  if (!db) throw new Error('Database connection unavailable');

  const normalizedUser = (username || '').trim().toLowerCase();
  const user = await db.collection('admin_users').findOne({ username: normalizedUser });
  if (!user) {
    throw new Error('Invalid username or password');
  }

  const isValid = verifyPassword(password, user.salt, user.passwordHash);
  if (!isValid) {
    throw new Error('Invalid username or password');
  }

  await db.collection('admin_users').updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date().toISOString() } }
  );

  const session = await createSession(user._id.toString(), user.displayName || user.username, 'password_login', clientMeta);
  return {
    success: true,
    admin: {
      id: user._id.toString(),
      username: user.displayName || user.username,
      role: user.role || 'admin'
    },
    ...session
  };
}

/**
 * Authenticates using the Master ADMIN_API_KEY and issues a token
 */
async function loginWithMasterKey(apiKey, clientMeta = {}) {
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) {
    throw new Error('Invalid Master Authorization Key');
  }

  const session = await createSession('master_admin', 'Master Administrator', 'master_key', clientMeta);
  return {
    success: true,
    admin: {
      id: 'master_admin',
      username: 'Master Administrator',
      role: 'superadmin'
    },
    ...session
  };
}

/**
 * Creates an active session in MongoDB Atlas and returns a signed token
 */
async function createSession(adminId, username, authMethod = 'credentials', clientMeta = {}, rotationCount = 0) {
  const db = await getDb();
  const now = Date.now();
  const expiresAt = now + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const sessionId = crypto.randomBytes(18).toString('hex');

  const payload = {
    sub: adminId,
    username,
    sid: sessionId,
    iat: now,
    exp: expiresAt,
    rot: rotationCount
  };

  const token = createSignedToken(payload);
  const tokenRecord = {
    sessionId,
    adminId,
    username,
    tokenHash: hashToken(token),
    authMethod,
    rotationCount,
    revoked: false,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAt).toISOString(),
    expiresAtMs: expiresAt,
    clientIp: clientMeta.ip || 'unknown',
    userAgent: clientMeta.userAgent || 'unknown',
    lastActiveAt: new Date(now).toISOString()
  };

  if (db) {
    try {
      await db.collection('admin_sessions').insertOne(tokenRecord);
    } catch (err) {
      console.warn('[AuthService] Could not persist session in DB:', err.message);
    }
  }

  return {
    token,
    expiresAt,
    expiresAtFormatted: new Date(expiresAt).toLocaleString(),
    rotationCount,
    sessionId
  };
}

/**
 * Rotates an active session token:
 * Invalidates old token and immediately issues a new token with fresh lifetime
 */
async function rotateToken(oldToken, clientMeta = {}) {
  const payload = verifySignedToken(oldToken);
  if (!payload || !payload.sid) {
    throw new Error('Invalid or expired token. Cannot rotate.');
  }

  const db = await getDb();
  const oldTokenHashed = hashToken(oldToken);

  if (db) {
    // Check if session was already revoked
    const existingSession = await db.collection('admin_sessions').findOne({
      sessionId: payload.sid,
      tokenHash: oldTokenHashed
    });

    if (existingSession && existingSession.revoked) {
      throw new Error('Security Alert: This token has already been revoked or rotated.');
    }

    // Mark old session as rotated/revoked
    await db.collection('admin_sessions').updateOne(
      { sessionId: payload.sid, tokenHash: oldTokenHashed },
      {
        $set: {
          revoked: true,
          revokedAt: new Date().toISOString(),
          revocationReason: 'token_rotation'
        }
      }
    );
  }

  const newRotationCount = (payload.rot || 0) + 1;
  const newSession = await createSession(
    payload.sub,
    payload.username,
    'token_rotation',
    clientMeta,
    newRotationCount
  );

  return {
    success: true,
    message: `Security token rotated successfully (Generation #${newRotationCount})`,
    ...newSession
  };
}

/**
 * Validates a session token (signature, expiration, and database revocation status)
 */
async function validateSessionToken(token) {
  const payload = verifySignedToken(token);
  if (!payload) {
    return { valid: false, error: 'Token signature invalid or expired' };
  }

  const db = await getDb();
  if (db) {
    try {
      const hashed = hashToken(token);
      const sessionDoc = await db.collection('admin_sessions').findOne({
        sessionId: payload.sid,
        tokenHash: hashed
      });

      if (!sessionDoc) {
        return { valid: false, error: 'Session not found in active session store' };
      }

      if (sessionDoc.revoked) {
        return { valid: false, error: 'Session has been revoked' };
      }

      // Touch last active
      db.collection('admin_sessions').updateOne(
        { _id: sessionDoc._id },
        { $set: { lastActiveAt: new Date().toISOString() } }
      ).catch(() => {});
    } catch {
      // If DB read temporarily times out, signed payload remains cryptographically valid
    }
  }

  return {
    valid: true,
    adminId: payload.sub,
    username: payload.username,
    expiresAt: payload.exp,
    rotationCount: payload.rot || 0,
    sessionId: payload.sid
  };
}

/**
 * Emergency: Revokes all active sessions for an admin
 */
async function revokeAllSessions(adminId = null) {
  const db = await getDb();
  if (!db) throw new Error('Database connection unavailable');

  const filter = adminId ? { adminId } : {};
  const result = await db.collection('admin_sessions').updateMany(
    { ...filter, revoked: false },
    {
      $set: {
        revoked: true,
        revokedAt: new Date().toISOString(),
        revocationReason: 'emergency_revoke_all'
      }
    }
  );

  return {
    success: true,
    revokedCount: result.modifiedCount,
    message: `Revoked ${result.modifiedCount} active session(s). All users must re-authenticate.`
  };
}

module.exports = {
  isAdminRegistered,
  registerAdmin,
  loginWithCredentials,
  loginWithMasterKey,
  validateSessionToken,
  rotateToken,
  revokeAllSessions
};
