import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBackendConfiguration } from '../config/environment.js';
import { pool as db } from '../db/connection.js';
import logger from '../utils/logger.js';

/**
 * Gemini AI-based Suspicious Activity Analyzer
 *
 * Uses Google Gemini 2.0 Flash (FREE TIER) to analyze login/logout patterns
 * and detect sophisticated multi-accounting that rule-based systems miss.
 */

interface LoginEvent {
  timestamp: string;
  account_name: string;
  character_name: string;
  ip_address: string;
  status: 'login' | 'logout';
}

interface GeminiAnalysisResult {
  suspicious_accounts: {
    account_name: string;
    confidence_score: number;
    reasons: string[];
    evidence: string[];
    recommended_action: 'monitor' | 'investigate' | 'flag';
  }[];
  patterns_detected: {
    pattern_type: string;
    description: string;
    accounts_involved: string[];
    severity: 'low' | 'medium' | 'high';
  }[];
  summary: string;
  analysis_timestamp: string;
}

/**
 * Fetch login data for analysis
 */
async function fetchLoginData(daysBack: number = 30): Promise<LoginEvent[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const [rows] = await db.query(
    `
    SELECT
      timestamp,
      account_name,
      character_name,
      ip_address,
      status
    FROM account_login_history
    WHERE timestamp >= ?
    ORDER BY timestamp ASC
    `,
    [cutoffDate],
  );

  return rows as LoginEvent[];
}

/**
 * Summarize events for more compact prompt
 */
function summarizeEvents(events: LoginEvent[]): string {
  // Group by account and create summary
  const accountSummaries = new Map<string, any>();

  events.forEach((event) => {
    if (!accountSummaries.has(event.account_name)) {
      accountSummaries.set(event.account_name, {
        account: event.account_name,
        characters: new Set<string>(),
        ips: new Set<string>(),
        logins: [],
        logouts: [],
      });
    }

    const summary = accountSummaries.get(event.account_name)!;
    summary.characters.add(event.character_name);
    summary.ips.add(event.ip_address);

    if (event.status === 'login') {
      summary.logins.push(`${event.timestamp}|${event.character_name}|${event.ip_address}`);
    } else {
      summary.logouts.push(`${event.timestamp}|${event.character_name}|${event.ip_address}`);
    }
  });

  // Convert to compact string format
  const summaries = Array.from(accountSummaries.values()).map((s) => ({
    account: s.account,
    chars: Array.from(s.characters),
    ips: Array.from(s.ips),
    logins: s.logins, // All logins
    logouts: s.logouts, // All logouts
  }));

  return JSON.stringify(summaries, null, 1);
}

/**
 * Build analysis prompt for Gemini
 */
function buildPrompt(events: LoginEvent[]): string {
  const dataCompact = summarizeEvents(events);

  return `You are a fraud detection expert for a MUD game. Analyze login patterns to find multi-accounting (one player controlling multiple characters simultaneously).

**RULES:**
- Players CAN have multiple characters
- Players CANNOT play them at the same time
- Legitimate players may use different IPs (mobile, VPN, travel)

**DATA (${events.length} events, summarized by account):**
Format: account, characters, IPs, login events (timestamp|char|ip), logout events
\`\`\`json
${dataCompact}
\`\`\`

**DETECT:**
1. Overlapping sessions (same account, multiple characters online simultaneously)
2. Shared IP clusters (multiple accounts from same IP)
3. Temporal patterns (coordinated login/logout timing)
4. Behavioral fingerprints (similar session patterns)
5. IP hopping (suspicious rapid IP changes)

**OUTPUT JSON:**
\`\`\`json
{
  "suspicious_accounts": [
    {
      "account_name": "string",
      "confidence_score": 0-100,
      "reasons": ["reason1", "reason2"],
      "evidence": ["evidence1", "evidence2"],
      "recommended_action": "monitor|investigate|flag"
    }
  ],
  "patterns_detected": [
    {
      "pattern_type": "overlapping_sessions|shared_ip_cluster|temporal_coordination|behavioral_similarity|ip_hopping",
      "description": "description",
      "accounts_involved": ["acc1", "acc2"],
      "severity": "low|medium|high"
    }
  ],
  "summary": "Executive summary of findings",
  "analysis_timestamp": "${new Date().toISOString()}"
}
\`\`\`

**SCORING:**
- 90-100: Extremely likely (overlapping sessions + same IP + patterns)
- 70-89: Very suspicious (overlapping + shared IP OR strong patterns)
- 50-69: Moderately suspicious (shared IP + some correlation)
- <50: Not suspicious

Only flag confidence >= 70. Be thorough and objective.`;
}

/**
 * Parse Gemini response
 */
function parseResponse(text: string): GeminiAnalysisResult {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonText = jsonMatch ? jsonMatch[1] : text;

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    logger.error('Failed to parse Gemini response:', error);
    throw new Error('Invalid JSON from Gemini AI');
  }
}

/**
 * Main analysis function
 */
export async function analyzeWithGemini(daysBack: number = 30): Promise<GeminiAnalysisResult> {
  logger.info(`starting gemini ai analysis (${daysBack} days)...`);

  const configuration = getBackendConfiguration();
  if (!configuration.features.gemini || !configuration.geminiApiKey) {
    throw new Error('Gemini integration is disabled');
  }

  // Initialize Gemini
  const genAI = new GoogleGenerativeAI(configuration.geminiApiKey);
  // Use stable free tier model (gemini-2.5-flash is free and fast)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  // Fetch data
  const events = await fetchLoginData(daysBack);
  logger.info(`Analyzing ${events.length} events`);

  if (events.length === 0) {
    return {
      suspicious_accounts: [],
      patterns_detected: [],
      summary: 'No login data available.',
      analysis_timestamp: new Date().toISOString(),
    };
  }

  // Build prompt
  const prompt = buildPrompt(events);
  logger.info(`Prompt: ${Math.round(prompt.length / 4)} tokens (estimated)`);

  // Send to Gemini with timeout
  logger.info('Sending to Gemini 2.5 Flash...');
  logger.info(`Data size: ${events.length} events, prompt length: ${prompt.length} chars`);

  let text: string;
  try {
    // Add 10 minute timeout (free tier can be slow)
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Gemini API request timeout after 10 minutes')), 600000);
    });

    const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);

    logger.info('Response received from Gemini');

    const response = result.response;
    text = response.text();

    logger.info(`Received ${text.length} characters`);
  } catch (geminiError: any) {
    logger.error('Gemini API error:', geminiError);
    logger.error('Error details:', geminiError.message);
    if (geminiError.stack) {
      logger.error('Stack trace:', geminiError.stack);
    }
    throw geminiError;
  }

  // Parse response
  const analysis = parseResponse(text);
  logger.info(`Found ${analysis.suspicious_accounts.length} suspicious accounts`);

  return analysis;
}

/**
 * Store analysis results in database
 */
export async function storeAnalysis(analysis: GeminiAnalysisResult): Promise<void> {
  // Convert ISO timestamp to MySQL datetime format
  const mysqlTimestamp = new Date(analysis.analysis_timestamp)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  // Store overall analysis
  await db.query(
    `INSERT INTO gemini_analysis_log
     (analysis_timestamp, suspicious_count, patterns_count, summary, full_results)
     VALUES (?, ?, ?, ?, ?)`,
    [
      mysqlTimestamp,
      analysis.suspicious_accounts.length,
      analysis.patterns_detected.length,
      analysis.summary,
      JSON.stringify(analysis),
    ],
  );

  // Update suspicious_accounts table
  for (const account of analysis.suspicious_accounts) {
    if (account.confidence_score >= 70) {
      const [existing]: any = await db.query(
        'SELECT id FROM suspicious_accounts WHERE account_name = ? AND is_resolved = FALSE',
        [account.account_name],
      );

      const evidence = {
        gemini_confidence: account.confidence_score,
        gemini_reasons: account.reasons,
        gemini_evidence: account.evidence,
        gemini_action: account.recommended_action,
        gemini_analyzed_at: analysis.analysis_timestamp,
      };

      if (existing.length > 0) {
        // Update existing
        await db.query(
          `UPDATE suspicious_accounts
           SET suspicion_score = GREATEST(suspicion_score, ?),
               evidence = JSON_MERGE_PATCH(evidence, ?)
           WHERE account_name = ? AND is_resolved = FALSE`,
          [account.confidence_score, JSON.stringify(evidence), account.account_name],
        );
      } else {
        // Create new flag
        await db.query(
          `INSERT INTO suspicious_accounts
           (account_name, suspicion_score, evidence, flagged_at, is_resolved)
           VALUES (?, ?, ?, NOW(), FALSE)`,
          [account.account_name, account.confidence_score, JSON.stringify(evidence)],
        );
      }
    }
  }

  logger.info('Analysis stored in database');
}
