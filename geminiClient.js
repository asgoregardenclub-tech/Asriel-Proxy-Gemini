/**
 * geminiClient.js
 * Backwards compatibility alias for GeminiGuestClient.
 */

import { GeminiGuestClient } from './geminiGuestClient.js';

export class GeminiClient extends GeminiGuestClient {}
export default GeminiClient;
