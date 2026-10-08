import { z } from 'zod';

const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'mail', 'static'];

// Becomes a DNS label (<slug>.<domain>): lowercase letters, digits, inner hyphens.
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'slug must be 1-40 lowercase letters, digits or hyphens')
  .refine((s) => !RESERVED_SLUGS.includes(s), 'slug is reserved');

export const emailSchema = z.string().trim().toLowerCase().email('a valid email is required');

// WhatsApp numbers in international format, e.g. +5233123456701.
export const whatsappSchema = z.string().trim().regex(/^\+\d{10,15}$/, 'WhatsApp number must look like +523312345678');

export const passwordSchema = z.string().min(10, 'password must be at least 10 characters').max(200);
