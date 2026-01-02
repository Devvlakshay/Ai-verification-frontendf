import { SignJWT, jwtVerify } from 'jose';

// JWT Configuration - should match backend
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'your-super-secret-key-change-in-production';
const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER || 'ai-verification-frontend';
const JWT_EXPIRATION = '5m'; // Token expires in 5 minutes

// Encode secret key to Uint8Array for jose library
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET_KEY);

/**
 * Generate a JWT token for backend API calls
 * The token includes a unique request ID and short expiration for security
 */
export async function generateBackendToken(userId?: string): Promise<string> {
  const requestId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  
  const token = await new SignJWT({
    request_id: requestId,
    user_id: userId || 'anonymous',
    type: 'backend_request',
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM })
    .setIssuedAt(now)
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(JWT_EXPIRATION)
    .sign(getSecretKey());

  return token;
}

/**
 * Verify a JWT token (for any future frontend verification needs)
 */
export async function verifyToken(token: string): Promise<{ valid: boolean; payload?: any; error?: string }> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      issuer: JWT_ISSUER,
    });
    return { valid: true, payload };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Get Authorization header value for backend requests
 */
export async function getAuthorizationHeader(userId?: string): Promise<{ Authorization: string }> {
  const token = await generateBackendToken(userId);
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create headers object with JWT Authorization for axios/fetch requests
 */
export async function getSecureHeaders(userId?: string): Promise<{
  'Content-Type': string;
  Authorization: string;
  'X-Request-ID': string;
}> {
  const token = await generateBackendToken(userId);
  const requestId = crypto.randomUUID();
  
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'X-Request-ID': requestId,
  };
}
