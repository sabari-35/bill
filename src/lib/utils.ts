import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Convert paise (integer) to formatted Rupees (e.g. ₹450 or ₹450.50)
export function formatCurrency(paise: number | null | undefined): string {
  if (paise == null || isNaN(paise)) return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

// Convert rupees input to paise integer
export function toPaise(rupees: number | string): number {
  const val = typeof rupees === 'string' ? parseFloat(rupees) : rupees;
  if (isNaN(val)) return 0;
  return Math.round(val * 100);
}

// Convert paise to rupees number
export function fromPaise(paise: number | null | undefined): number {
  if (paise == null || isNaN(paise)) return 0;
  return paise / 100;
}

// Clean and standardize phone number for WhatsApp direct link
// Handles Indian 10-digit numbers (adds 91), strips spaces, dashes, +
export function cleanWhatsAppPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const digitsOnly = phone.replace(/\D/g, '');
  if (!digitsOnly) return '';

  // 10 digits standard mobile (e.g. India 9876543210 -> 919876543210)
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  // 11 digits starting with 0 (e.g. 09876543210 -> 919876543210)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    return `91${digitsOnly.slice(1)}`;
  }
  // Already has country code
  return digitsOnly;
}

// Generate direct WhatsApp chat URL
export function generateWhatsAppUrl({
  phone,
  message,
}: {
  phone?: string | null;
  message: string;
}): string {
  const cleanPhone = cleanWhatsAppPhone(phone);
  const encodedMsg = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  }
  return `https://api.whatsapp.com/send?text=${encodedMsg}`;
}

// Generate UPI Payment Link (opens GPay, PhonePe, Paytm, etc.)
export function generateUpiUrl({
  upiId,
  payeeName,
  amountInRupees,
  note = 'SplitBill Settlement',
}: {
  upiId?: string;
  payeeName?: string;
  amountInRupees: number;
  note?: string;
}): string {
  const pa = encodeURIComponent(upiId || 'host@upi');
  const pn = encodeURIComponent(payeeName || 'SplitBill Host');
  const am = encodeURIComponent(amountInRupees.toFixed(2));
  const tn = encodeURIComponent(note);
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

// Get QR Code Image URL for any data
export function getQrCodeImageUrl(data: string, size = 250): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}
