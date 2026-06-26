// ============================================================
//  X API Client — OAuth 1.0a (Sin browser, serverless-ready)
// ============================================================
//  Usa firma OAuth 1.0a + fetch nativo para llamar a la API v2
//  Endpoint: POST https://api.x.com/2/tweets
// ============================================================

import OAuth from 'oauth-1.0a';
import crypto from 'crypto';

const API_BASE = 'https://api.x.com/2';

/**
 * Crea un cliente para la X API v2 con OAuth 1.0a
 * No necesita browser ni tokens temporales.
 */
export function crearCliente({ apiKey, apiKeySecret, accessToken, accessTokenSecret }) {
  const oauth = new OAuth({
    consumer: { key: apiKey, secret: apiKeySecret },
    signature_method: 'HMAC-SHA1',
    hash_function(baseString, key) {
      return crypto.createHmac('sha1', key).update(baseString).digest('base64');
    },
  });

  const token = { key: accessToken, secret: accessTokenSecret };

  /**
   * Hace una request autenticada a la API de X
   */
  async function request(method, endpoint, body = null) {
    const url = `${API_BASE}${endpoint}`;

    const authHeader = oauth.toHeader(
      oauth.authorize({ url, method }, token)
    );

    const options = {
      method,
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
        'User-Agent': 'x-bot-v3',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data?.detail || data?.title || `HTTP ${response.status}`);
      error.status = response.status;
      error.data = data;
      error.headers = Object.fromEntries(response.headers.entries());
      throw error;
    }

    return data;
  }

  return {
    /** Publica un post/tweet */
    async createPost(text) {
      return request('POST', '/tweets', { text });
    },

    /** Obtiene info del usuario autenticado */
    async getMe() {
      return request('GET', '/users/me');
    },
  };
}
