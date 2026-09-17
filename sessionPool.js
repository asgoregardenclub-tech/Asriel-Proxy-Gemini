/**
 * sessionPool.js
 * Dynamic Session Pool and Rotator for anonymous Gemini Guest Web sessions.
 * Manages WIZ global tokens (SNlM0e, cfb2h, FdrFJe) and session lifecycle.
 */

import crypto from 'node:crypto';
import { config } from './config.js';

export class GuestSession {
  constructor({ cookies, snlm0e, bl, fSid, reqId }) {
    this.id = crypto.randomUUID();
    this.cookies = cookies || '';
    this.snlm0e = snlm0e || '';
    this.bl = bl || config.geminiBl;
    this.fSid = fSid || '';
    this.reqId = reqId || Math.floor(Math.random() * 800000) + 100000;
    this.createdAt = Date.now();
    this.useCount = 0;
    this.isAlive = true;
  }

  getNextReqId() {
    this.useCount++;
    this.reqId += 100000;
    return this.reqId;
  }

  isExpired() {
    const age = Date.now() - this.createdAt;
    return (
      !this.isAlive ||
      age > config.sessionMaxAgeMs ||
      this.useCount >= config.sessionMaxUses
    );
  }
}

export class SessionPool {
  constructor() {
    this.activePool = [];
    this.conversationMap = new Map();
    this.isRefilling = false;
  }

  /**
   * Initializes the session pool with prewarmed guest handshakes.
   */
  async initialize() {
    console.log('[SessionPool] Pre-warming anonymous Gemini guest sessions...');
    const spawnPromises = [];
    for (let i = 0; i < config.poolMinAlive; i++) {
      spawnPromises.push(this.createNewGuestSession());
    }

    const results = await Promise.allSettled(spawnPromises);
    for (const res of results) {
      if (res.status === 'fulfilled' && res.value) {
        this.activePool.push(res.value);
      }
    }

    console.log(`[SessionPool] Initialized with ${this.activePool.length} active guest session(s).`);
  }

  /**
   * Performs an anonymous handshake directly with gemini.google.com to acquire guest cookies & CSRF tokens.
   */
  async createNewGuestSession() {
    try {
      const res = await fetch('https://gemini.google.com/app', {
        method: 'GET',
        headers: {
          'User-Agent': config.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
      });

      // Extract Set-Cookie headers natively
      const cookieJar = [];
      if (typeof res.headers.getSetCookie === 'function') {
        const rawCookies = res.headers.getSetCookie();
        for (const rc of rawCookies) {
          const cookiePair = rc.split(';')[0];
          if (cookiePair) cookieJar.push(cookiePair.trim());
        }
      } else {
        const rawCookie = res.headers.get('set-cookie');
        if (rawCookie) {
          const parts = rawCookie.split(/,(?=\s*[A-Za-z0-9_\-]+=[^;]+)/);
          for (const p of parts) {
            const pair = p.split(';')[0];
            if (pair) cookieJar.push(pair.trim());
          }
        }
      }

      const html = await res.text();

      // Extract WIZ tokens from Gemini landing payload
      const snlm0e = html.match(/"SNlM0e":"([^"]+)"/)?.[1] || '';
      const cfb2h =
        html.match(/"cfb2h":"([^"]+)"/)?.[1] ||
        html.match(/(boq_assistant-bard-web-server_[\w.\-]+)/)?.[1] ||
        config.geminiBl;
      const fSid = html.match(/"FdrFJe":"([^"]+)"/)?.[1] || '';

      const session = new GuestSession({
        cookies: cookieJar.join('; '),
        snlm0e,
        bl: cfb2h,
        fSid,
        reqId: Math.floor(Math.random() * 800000) + 100000
      });

      return session;
    } catch (err) {
      console.warn(`[SessionPool] Anonymous handshake encounter: ${err.message}. Generating decoupled session.`);
      return new GuestSession({
        cookies: '',
        snlm0e: '',
        bl: config.geminiBl,
        fSid: '',
        reqId: Math.floor(Math.random() * 800000) + 100000
      });
    }
  }

  /**
   * Acquires a healthy session, isolated per conversation ID if provided.
   */
  async acquireSession(conversationId = null) {
    this.cleanExpiredSessions();

    // 1. If conversation tracking ID is provided, reuse conversation session if alive
    if (conversationId && this.conversationMap.has(conversationId)) {
      const existing = this.conversationMap.get(conversationId);
      if (!existing.isExpired()) {
        return existing;
      }
      this.conversationMap.delete(conversationId);
    }

    // 2. Obtain from active pool
    let session = this.activePool.find((s) => !s.isExpired());

    if (!session) {
      session = await this.createNewGuestSession();
      this.activePool.push(session);
    }

    if (conversationId) {
      this.conversationMap.set(conversationId, session);
    }

    // Refill background pool if running low
    this.triggerBackgroundRefill();

    return session;
  }

  /**
   * Invalidates and discards a session (e.g. on upstream rate limit or rejection).
   */
  invalidateSession(session) {
    if (!session) return;
    session.isAlive = false;

    this.activePool = this.activePool.filter((s) => s.id !== session.id);

    for (const [convId, s] of this.conversationMap.entries()) {
      if (s.id === session.id) {
        this.conversationMap.delete(convId);
      }
    }

    this.triggerBackgroundRefill();
  }

  cleanExpiredSessions() {
    this.activePool = this.activePool.filter((s) => !s.isExpired());
    for (const [convId, s] of this.conversationMap.entries()) {
      if (s.isExpired()) {
        this.conversationMap.delete(convId);
      }
    }
  }

  async triggerBackgroundRefill() {
    if (this.isRefilling || this.activePool.length >= config.poolMinAlive) return;

    this.isRefilling = true;
    try {
      while (this.activePool.length < config.poolMinAlive) {
        const newSession = await this.createNewGuestSession();
        if (newSession) {
          this.activePool.push(newSession);
        }
      }
    } finally {
      this.isRefilling = false;
    }
  }

  getActiveCount() {
    return this.activePool.filter((s) => !s.isExpired()).length;
  }
}

export const sessionPool = new SessionPool();
