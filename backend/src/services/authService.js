/**
 * Authentication & Tokenization Service
 * Provides cryptographic token generation, rotation, hashing, and session management in MongoDB Atlas.
 */

const crypto = require('node:crypto');
const { getDb } = require('./mongoService');
const { secretEquals } = require('../utils/security');

// Derived secret for HMAC signing of tokens
const MASTER_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_API_KEY || crypto.randomBytes(32).toString('hex');
const TOKEN_EXPIRY_HOURS = 12;

/**
 * Role-Based Access Control (RBAC) Permissions Matrix
 * Standardizes administrative capabilities and safeguards privileged operations.
 */
const ROLE_PERMISSIONS = {
  superadmin: ['*'], // Wildcard access to all administrative capabilities
  admin: [
    'scrape:run',
    'notifications:dispatch',
    'notifications:view_logs',
    'reminders:dispatch',
    'database:status',
    'track_job:view'
  ],
  viewer: [
    'notifications:view_logs',
    'database:status',
    'track_job:view'
  ]
};

/**
 * Resolves all permissions granted to a role and optional custom permissions
 */
function getGrantedPermissions(role, customPermissions = []) {
  const rolePerms = ROLE_PERMISSIONS[role] || [];
  if (rolePerms.includes('*')) return ['*'];
  return Array.from(new Set([...rolePerms, ...(customPermissions || [])]));
}

/**
 * Verifies if an admin role or custom permission set satisfies a required permission
 */
function checkPermission(userRole, userPermissions = [], requiredPermission = null) {
  if (!requiredPermission) return true;
  if (userRole === 'superadmin') return true;
  const perms = Array.isArray(userPermissions) && userPermissions.length > 0
    ? userPermissions
    : getGrantedPermissions(userRole);
  if (perms.includes('*')) return true;
  return perms.includes(requiredPermission);
}

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
  if (!token || typeof token !== 'string' || token.length > 8192) return null;
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
    if (!payload || typeof payload !== 'object' || !Number.isFinite(payload.exp) || Date.now() >= payload.exp || typeof payload.sid !== 'string' || typeof payload.sub !== 'string') {
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
  // All registrations, including bootstrap, require the master key.
  {
    const expectedMasterKey = process.env.ADMIN_API_KEY;
    if (!secretEquals(masterKey, expectedMasterKey)) {
      throw new Error('Master Authorization Key is required to register an additional administrator');
    }
  }

  const normalizedUser = username.trim().toLowerCase();
  const existingUser = await db.collection('admin_users').findOne({ username: normalizedUser });
  if (existingUser) {
    throw new Error(`Username "${username}" is already registered`);
  }

  const { salt, hash } = hashPassword(password);
  const role = existingCount === 0 ? 'superadmin' : 'admin';
  const permissions = getGrantedPermissions(role);
  const adminDoc = {
    username: normalizedUser,
    displayName: username.trim(),
    passwordHash: hash,
    salt,
    role,
    permissions,
    createdAt: new Date().toISOString(),
    lastLoginAt: null
  };

  const result = await db.collection('admin_users').insertOne(adminDoc);
  const session = await createSession(result.insertedId.toString(), normalizedUser, 'initial_registration', {}, 0, role, permissions);

  return {
    success: true,
    message: 'Admin account registered successfully',
    admin: {
      id: result.insertedId.toString(),
      username: adminDoc.displayName,
      role: adminDoc.role,
      permissions
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

  const role = user.role || 'admin';
  const permissions = getGrantedPermissions(role, user.permissions || []);
  const session = await createSession(user._id.toString(), user.displayName || user.username, 'password_login', clientMeta, 0, role, permissions);
  return {
    success: true,
    admin: {
      id: user._id.toString(),
      username: user.displayName || user.username,
      role,
      permissions
    },
    ...session
  };
}

/**
 * Authenticates using the Master ADMIN_API_KEY and issues a token
 */
async function loginWithMasterKey(apiKey, clientMeta = {}) {
  const expectedKey = process.env.ADMIN_API_KEY;
  if (!secretEquals(apiKey, expectedKey)) {
    throw new Error('Invalid Master Authorization Key');
  }

  const session = await createSession('master_admin', 'Master Administrator', 'master_key', clientMeta, 0, 'superadmin', ['*']);
  return {
    success: true,
    admin: {
      id: 'master_admin',
      username: 'Master Administrator',
      role: 'superadmin',
      permissions: ['*']
    },
    ...session
  };
}

/**
 * Creates an active session in MongoDB Atlas and returns a signed token
 */
async function createSession(adminId, username, authMethod = 'credentials', clientMeta = {}, rotationCount = 0, role = 'admin', customPermissions = []) {
  const db = await getDb();
  const now = Date.now();
  const expiresAt = now + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000;
  const sessionId = crypto.randomBytes(18).toString('hex');
  const permissions = getGrantedPermissions(role, customPermissions);

  const payload = {
    sub: adminId,
    username,
    role,
    permissions,
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
    role,
    permissions,
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

  if (!db) throw new Error('Session store unavailable');
  await db.collection('admin_sessions').insertOne(tokenRecord);

  return {
    token,
    role,
    permissions,
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

  const validation = await validateSessionToken(oldToken);
  if (!validation.valid) throw new Error('Invalid or revoked session');
  const db = await getDb();
  if (!db) throw new Error('Session store unavailable');
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
    const revoked = await db.collection('admin_sessions').updateOne(
      { sessionId: payload.sid, tokenHash: oldTokenHashed, revoked: false },
      {
        $set: {
          revoked: true,
          revokedAt: new Date().toISOString(),
          revocationReason: 'token_rotation'
        }
      }
    );
    if (revoked.modifiedCount !== 1) throw new Error('Session already revoked or rotated');
  }

  const newRotationCount = (payload.rot || 0) + 1;
  const newSession = await createSession(
    payload.sub,
    payload.username,
    'token_rotation',
    clientMeta,
    newRotationCount,
    payload.role || 'admin',
    payload.permissions || []
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

  let db;
  try { db = await getDb(); } catch { return { valid: false, error: 'Session store unavailable' }; }
  if (!db) return { valid: false, error: 'Session store unavailable' };
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
      return { valid: false, error: 'Session store unavailable' };
    }
  }

  const role = payload.role || 'admin';
  const permissions = payload.permissions || getGrantedPermissions(role);

  return {
    valid: true,
    adminId: payload.sub,
    username: payload.username,
    role,
    permissions,
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
  ROLE_PERMISSIONS,
  getGrantedPermissions,
  checkPermission,
  isAdminRegistered,
  registerAdmin,
  loginWithCredentials,
  loginWithMasterKey,
  validateSessionToken,
  rotateToken,
  revokeAllSessions
};
