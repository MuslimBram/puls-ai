/**
 * PULSE AI — CAL.COM API v2 TYPES & ENDPOINT-VERSION MAP (PHASE C2.1)
 *
 * Centralized mapping for Cal.com API v2 endpoint-specific version headers.
 * Never guess API versions or rely on a single global constant.
 */

export const CALCOM_ENDPOINT_VERSIONS: Record<string, string> = {
  "GET /v2/event-types": "2024-06-14",
  "GET /v2/slots": "2024-09-04",
  "GET /v2/slots/available": "2024-09-04",
  "GET /v2/bookings": "2026-05-01",
  "GET /v2/bookings/{id}": "2026-02-25",
  "GET /v2/bookings/{bookingUid}": "2026-02-25",
  "POST /v2/bookings": "2026-02-25",
  "POST /v2/bookings/{uid}/reschedule": "2026-02-25",
  "POST /v2/bookings/{bookingUid}/reschedule": "2026-02-25",
  "POST /v2/bookings/{uid}/cancel": "2026-02-25",
  "POST /v2/bookings/{bookingUid}/cancel": "2026-02-25",
  "POST /v2/webhooks": "2024-08-13",
};

export type CalcomOAuthScope = "EVENT_TYPE_READ" | "BOOKING_READ" | "WEBHOOK_WRITE";

export type CalcomBookingStatus =
  | "BOOKING_CREATED"
  | "BOOKING_RESCHEDULED"
  | "BOOKING_CANCELLED"
  | "BOOKING_CONFIRMED"
  | "BOOKING_REJECTED"
  | "BOOKING_COMPLETED"
  | "BOOKING_NO_SHOW"
  | "BOOKING_REOPENED";

export interface CalcomConnection {
  workspace_id: string;
  account_id?: string;
  access_token_encrypted?: string;
  refresh_token_encrypted?: string;
  expires_at?: number;
  connection_status: "connected" | "reconnect_required" | "disconnected";
  webhook_secret_encrypted?: string;
  created_at: string;
}

export interface CalcomEventType {
  id: number;
  title: string;
  slug: string;
  length: number;
  description?: string;
}

export interface CalcomSlot {
  start: string;
  end: string;
}

export interface CalcomAttendee {
  name: string;
  email: string;
  timeZone?: string;
}

export interface CalcomBooking {
  bookingUid: string;
  eventTypeId: number;
  title: string;
  description?: string;
  start: string;
  end: string;
  status: string;
  attendees: CalcomAttendee[];
  meetingUrl?: string;
  created_at: string;
}

export interface CalcomWebhookEvent {
  triggerEvent: CalcomBookingStatus;
  createdAt: string;
  payload: {
    bookingUid: string;
    eventTypeId: number;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    organizer?: CalcomAttendee;
    responses?: {
      name?: { value: string };
      email?: { value: string };
    };
  };
}
