/**
 * WhatsApp Service – Meta Cloud API (WhatsApp Business Platform)
 *
 * Responsibilities:
 *  - Send text messages and template messages via the Meta Cloud API.
 *  - Send media messages (PDF vouchers) with optional caption.
 *  - Log every outbound message to `whatsapp_messages` for audit / analytics.
 *  - Update message status on delivery / read webhook callbacks.
 *  - Provide helpers consumed by whatsappDiaryService and whatsappVoucherService.
 *
 * Environment variables (loaded via dotenv in server/db.ts before this module):
 *  WHATSAPP_PHONE_NUMBER_ID   – Meta Cloud API phone-number ID (required)
 *  WHATSAPP_ACCESS_TOKEN      – Permanent / long-lived system-user token (required)
 *  WHATSAPP_WEBHOOK_VERIFY_TOKEN – Token used to verify the webhook endpoint (optional)
 *  WHATSAPP_API_VERSION       – Graph API version, default "v19.0"
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../db.js";
import {
  whatsappMessages,
  whatsappTemplates,
  type InsertWhatsappMessage,
  type WhatsappMessage,
  type WhatsappTemplate,
  type WhatsappMessageStatus,
} from "../../shared/schema.js";

// Re-export so consumers (e.g. routes.ts) can import it from this module
export type { WhatsappMessageStatus };

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const GRAPH_API_VERSION =
  process.env.WHATSAPP_API_VERSION ?? "v19.0";

const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) {
    throw new WhatsappConfigError(
      "WHATSAPP_PHONE_NUMBER_ID is not set. Add it to .env.local."
    );
  }
  return id;
}

function getAccessToken(): string {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new WhatsappConfigError(
      "WHATSAPP_ACCESS_TOKEN is not set. Add it to .env.local."
    );
  }
  return token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom error types
// ─────────────────────────────────────────────────────────────────────────────

export class WhatsappConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsappConfigError";
  }
}

export class WhatsappApiError extends Error {
  readonly statusCode: number;
  readonly apiErrorCode?: number;
  readonly apiErrorMessage?: string;

  constructor(
    message: string,
    statusCode: number,
    apiErrorCode?: number,
    apiErrorMessage?: string
  ) {
    super(message);
    this.name = "WhatsappApiError";
    this.statusCode = statusCode;
    this.apiErrorCode = apiErrorCode;
    this.apiErrorMessage = apiErrorMessage;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta Cloud API payload types
// ─────────────────────────────────────────────────────────────────────────────

type MetaTextPayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "text";
  text: { body: string; preview_url?: boolean };
};

type MetaTemplateComponent =
  | { type: "header"; parameters: MetaTemplateParameter[] }
  | { type: "body"; parameters: MetaTemplateParameter[] }
  | { type: "footer"; parameters: MetaTemplateParameter[] };

type MetaTemplateParameter =
  | { type: "text"; text: string }
  | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: "document"; document: { link: string; filename?: string } };

type MetaTemplatePayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "template";
  template: {
    name: string;
    language: { code: string };
    components?: MetaTemplateComponent[];
  };
};

type MetaMediaPayload = {
  messaging_product: "whatsapp";
  recipient_type: "individual";
  to: string;
  type: "document";
  document: {
    link: string;
    caption?: string;
    filename?: string;
  };
};

type MetaApiResponse = {
  messages?: { id: string }[];
  error?: {
    message: string;
    type: string;
    code: number;
    fbtrace_id?: string;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Public input types
// ─────────────────────────────────────────────────────────────────────────────

export type SendTextInput = {
  /** E.164 format, e.g. "+923001234567" */
  to: string;
  body: string;
  recipientId?: number;
  recipientType?: string;
  metadata?: Record<string, unknown>;
};

export type SendTemplateInput = {
  to: string;
  templateName: string;
  languageCode?: string;
  /** Ordered list of body variable values */
  variables?: string[];
  recipientId?: number;
  recipientType?: string;
  metadata?: Record<string, unknown>;
};

export type SendDocumentInput = {
  to: string;
  /** Publicly accessible URL of the PDF */
  documentUrl: string;
  caption?: string;
  filename?: string;
  recipientId?: number;
  recipientType?: string;
  metadata?: Record<string, unknown>;
};

export type WhatsappSendResult = {
  messageId: number;
  waMessageId: string | null;
  status: WhatsappMessageStatus;
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalise phone number to E.164 (best-effort)
// ─────────────────────────────────────────────────────────────────────────────

export function normalisePhone(raw: string): string {
  // Strip everything except digits and a leading +
  const stripped = raw.replace(/[^\d+]/g, "");
  if (stripped.startsWith("+")) return stripped;
  // Assume Pakistan (+92) if 11-digit local number starting with 03
  if (/^03\d{9}$/.test(stripped)) return `+92${stripped.slice(1)}`;
  // Prepend + if it looks like an international number without the prefix
  if (stripped.length >= 10) return `+${stripped}`;
  // Return as-is for very short / unrecognised numbers
  return stripped;
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level Meta Cloud API caller
// ─────────────────────────────────────────────────────────────────────────────

async function callMetaApi(
  payload: MetaTextPayload | MetaTemplatePayload | MetaMediaPayload
): Promise<string> {
  const phoneNumberId = getPhoneNumberId();
  const accessToken = getAccessToken();
  const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as MetaApiResponse;

  if (!response.ok) {
    const apiErr = body.error;
    throw new WhatsappApiError(
      `Meta Cloud API error ${response.status}: ${apiErr?.message ?? response.statusText}`,
      response.status,
      apiErr?.code,
      apiErr?.message
    );
  }

  const waMessageId = body.messages?.[0]?.id ?? "";
  return waMessageId;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────

async function createMessageLog(
  insert: InsertWhatsappMessage
): Promise<WhatsappMessage> {
  const [row] = await db
    .insert(whatsappMessages)
    .values(insert)
    .returning();
  return row;
}

async function markMessageSent(
  id: number,
  waMessageId: string
): Promise<void> {
  await db
    .update(whatsappMessages)
    .set({
      status: "sent",
      waMessageId,
      sentAt: new Date(),
    })
    .where(eq(whatsappMessages.id, id));
}

async function markMessageFailed(
  id: number,
  errorMessage: string
): Promise<void> {
  await db
    .update(whatsappMessages)
    .set({ status: "failed", errorMessage })
    .where(eq(whatsappMessages.id, id));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Send a plain-text WhatsApp message and log it to the database.
 */
export async function sendTextMessage(
  input: SendTextInput
): Promise<WhatsappSendResult> {
  const normalisedTo = normalisePhone(input.to);

  // Create pending log entry first so we always have a record
  const logRow = await createMessageLog({
    recipientNumber: normalisedTo,
    recipientType: input.recipientType ?? "parent",
    recipientId: input.recipientId ?? null,
    messageBody: input.body,
    status: "pending",
    metadata: input.metadata ?? null,
  });

  try {
    const payload: MetaTextPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalisedTo,
      type: "text",
      text: { body: input.body },
    };

    const waMessageId = await callMetaApi(payload);
    await markMessageSent(logRow.id, waMessageId);

    console.log(
      `[WhatsApp] Text sent to ${normalisedTo} (db id=${logRow.id}, wa_id=${waMessageId})`
    );

    return { messageId: logRow.id, waMessageId, status: "sent" };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);
    await markMessageFailed(logRow.id, msg);
    console.error(`[WhatsApp] Failed to send text to ${normalisedTo}:`, msg);
    return { messageId: logRow.id, waMessageId: null, status: "failed" };
  }
}

/**
 * Send a WhatsApp template message and log it to the database.
 * Variables are substituted as ordered body parameters ({{1}}, {{2}}, …).
 */
export async function sendTemplateMessage(
  input: SendTemplateInput
): Promise<WhatsappSendResult> {
  const normalisedTo = normalisePhone(input.to);
  const languageCode = input.languageCode ?? "en";

  // Build a human-readable body for the log from the template record
  let messageBody = `[template: ${input.templateName}]`;
  try {
    const [tmpl] = await db
      .select()
      .from(whatsappTemplates)
      .where(eq(whatsappTemplates.name, input.templateName))
      .limit(1);
    if (tmpl) {
      messageBody = interpolateTemplate(
        tmpl.bodyText,
        input.variables ?? []
      );
    }
  } catch {
    // Non-fatal — log entry will still use the placeholder body
  }

  const logRow = await createMessageLog({
    recipientNumber: normalisedTo,
    recipientType: input.recipientType ?? "parent",
    recipientId: input.recipientId ?? null,
    messageBody,
    templateName: input.templateName,
    status: "pending",
    metadata: input.metadata ?? null,
  });

  try {
    const bodyParams: MetaTemplateParameter[] = (
      input.variables ?? []
    ).map((v) => ({ type: "text" as const, text: v }));

    const components: MetaTemplateComponent[] =
      bodyParams.length > 0
        ? [{ type: "body" as const, parameters: bodyParams }]
        : [];

    const payload: MetaTemplatePayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalisedTo,
      type: "template",
      template: {
        name: input.templateName,
        language: { code: languageCode },
        components,
      },
    };

    const waMessageId = await callMetaApi(payload);
    await markMessageSent(logRow.id, waMessageId);

    console.log(
      `[WhatsApp] Template "${input.templateName}" sent to ${normalisedTo} (db id=${logRow.id}, wa_id=${waMessageId})`
    );

    return { messageId: logRow.id, waMessageId, status: "sent" };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);
    await markMessageFailed(logRow.id, msg);
    console.error(
      `[WhatsApp] Failed to send template "${input.templateName}" to ${normalisedTo}:`,
      msg
    );
    return { messageId: logRow.id, waMessageId: null, status: "failed" };
  }
}

/**
 * Send a document (PDF) via WhatsApp and log it to the database.
 * The document must be hosted at a publicly accessible URL.
 */
export async function sendDocumentMessage(
  input: SendDocumentInput
): Promise<WhatsappSendResult> {
  const normalisedTo = normalisePhone(input.to);

  const logRow = await createMessageLog({
    recipientNumber: normalisedTo,
    recipientType: input.recipientType ?? "parent",
    recipientId: input.recipientId ?? null,
    messageBody: input.caption ?? `Document: ${input.filename ?? "attachment.pdf"}`,
    mediaUrl: input.documentUrl,
    mediaType: "application/pdf",
    status: "pending",
    metadata: input.metadata ?? null,
  });

  try {
    const payload: MetaMediaPayload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalisedTo,
      type: "document",
      document: {
        link: input.documentUrl,
        caption: input.caption,
        filename: input.filename ?? "document.pdf",
      },
    };

    const waMessageId = await callMetaApi(payload);
    await markMessageSent(logRow.id, waMessageId);

    console.log(
      `[WhatsApp] Document sent to ${normalisedTo} (db id=${logRow.id}, wa_id=${waMessageId})`
    );

    return { messageId: logRow.id, waMessageId, status: "sent" };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : String(error);
    await markMessageFailed(logRow.id, msg);
    console.error(
      `[WhatsApp] Failed to send document to ${normalisedTo}:`,
      msg
    );
    return { messageId: logRow.id, waMessageId: null, status: "failed" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook status update handler
// ─────────────────────────────────────────────────────────────────────────────

type WebhookStatusEntry = {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  errors?: { code: number; title: string }[];
};

/**
 * Process a status update from the Meta webhook.
 * Call this from the POST /api/whatsapp/webhook route handler.
 */
export async function handleWebhookStatusUpdate(
  entry: WebhookStatusEntry
): Promise<void> {
  const now = new Date(Number(entry.timestamp) * 1000);

  const updates: Partial<{
    status: WhatsappMessageStatus;
    deliveredAt: Date;
    readAt: Date;
    errorMessage: string;
  }> = {};

  switch (entry.status) {
    case "delivered":
      updates.status = "delivered";
      updates.deliveredAt = now;
      break;
    case "read":
      updates.status = "read";
      updates.readAt = now;
      break;
    case "failed":
      updates.status = "failed";
      updates.errorMessage =
        entry.errors?.map((e) => `${e.code}: ${e.title}`).join("; ") ??
        "Unknown error";
      break;
    default:
      // "sent" status is already set when we call the API — no update needed
      return;
  }

  await db
    .update(whatsappMessages)
    .set(updates)
    .where(eq(whatsappMessages.waMessageId, entry.id));

  console.log(
    `[WhatsApp] Webhook: message ${entry.id} → ${entry.status}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retrieve recent WhatsApp messages with optional status filter.
 */
export async function getRecentMessages(opts?: {
  limit?: number;
  status?: WhatsappMessageStatus;
  recipientId?: number;
}): Promise<WhatsappMessage[]> {
  const rows = await db.select().from(whatsappMessages);
  let filtered = rows;

  if (opts?.status) {
    filtered = filtered.filter((r) => r.status === opts.status);
  }
  if (opts?.recipientId !== undefined) {
    filtered = filtered.filter((r) => r.recipientId === opts.recipientId);
  }

  filtered.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return filtered.slice(0, opts?.limit ?? 50);
}

/**
 * Retrieve all active WhatsApp templates.
 */
export async function getActiveTemplates(): Promise<WhatsappTemplate[]> {
  return db
    .select()
    .from(whatsappTemplates)
    .where(eq(whatsappTemplates.isActive, true));
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace {{1}}, {{2}}, … placeholders with the supplied variable values.
 */
export function interpolateTemplate(
  template: string,
  variables: string[]
): string {
  return template.replace(/\{\{(\d+)\}\}/g, (_match, indexStr) => {
    const idx = Number(indexStr) - 1;
    return variables[idx] ?? "";
  });
}

/**
 * Check whether the WhatsApp integration is configured (env vars present).
 * Does NOT make a network call.
 */
export function isWhatsappConfigured(): boolean {
  return (
    Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID) &&
    Boolean(process.env.WHATSAPP_ACCESS_TOKEN)
  );
}
