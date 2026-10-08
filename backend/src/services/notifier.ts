import { randomUUID } from 'crypto';
import { TemplateName, render } from './templates';

export interface OutgoingMessage {
  phone: string; // E.164, e.g. +5215512345678
  template: TemplateName;
  params: string[]; // {{1}}, {{2}}, …
}

// permanent: retrying cannot help (bad number, template not approved); otherwise the worker retries.
export class SendError extends Error {
  constructor(message: string, public permanent: boolean) {
    super(message);
  }
}

export interface NotifierService {
  name: string;
  send(message: OutgoingMessage): Promise<string>; // the provider's message id
}

// Dev: prints the message the guardian would get.
export const consoleNotifier: NotifierService = {
  name: 'console',
  async send({ phone, template, params }) {
    console.log(`[WhatsApp] → ${phone} (${template}): ${render(template, params)}`);
    return `console-${randomUUID()}`;
  },
};

// Meta rate-limit errors come back as HTTP 400 but are worth retrying.
const RETRY_CODES = new Set([4, 80007, 130429, 131016, 131056]);

// WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates).
export function whatsappNotifier(token: string, phoneNumberId: string, version = 'v21.0'): NotifierService {
  return {
    name: 'whatsapp',
    async send({ phone, template, params }) {
      let res: Response;
      try {
        res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace('+', ''),
            type: 'template',
            template: {
              name: template,
              language: { code: 'es_MX' },
              components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
            },
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (err) {
        throw new SendError(`network: ${(err as Error).message}`, false);
      }
      const body = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { code?: number; message?: string };
      };
      if (res.ok && body.messages?.[0]?.id) return body.messages[0].id;
      const retry = res.status === 429 || res.status >= 500 || RETRY_CODES.has(body.error?.code ?? -1);
      throw new SendError(`${res.status} ${body.error?.code ?? ''} ${body.error?.message ?? ''}`.trim(), !retry);
    },
  };
}

const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID } = process.env;
export const notifier: NotifierService =
  WHATSAPP_TOKEN && WHATSAPP_PHONE_NUMBER_ID ? whatsappNotifier(WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) : consoleNotifier;
