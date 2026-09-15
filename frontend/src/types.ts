export type Host = {
  id: string;
  first_name: string;
  last_name_initial?: string;
  city?: string;
  avatar_url?: string | null;
  rating_avg: number;
  rating_count: number;
  identity_verification_status?: string;
  member_since?: string;
};

export type Meal = {
  id: string;
  host: Host;
  host_id: string;
  title: string;
  description: string;
  image?: string | null;
  price_cents: number;
  service_fee_cents: number;
  service_fee_percent: number;
  max_guests: number;
  remaining_guests: number;
  seats_taken: number;
  city?: string;
  starts_at?: string;
  status: string;
  dietary_tags: string[];
  cuisine_tags: string[];
  interest_tags: string[];
  features: string[];
  special_notes?: string | null;
  approx_latitude?: number | null;
  approx_longitude?: number | null;
  address_visible: boolean;
  exact_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at?: string;
};

export type AppConfig = {
  service_fee_percent: number;
  cancellation_policy: { full_refund_hours: number; partial_refund_percent: number };
  currency: string;
  locale: string;
  timezone: string;
  payments_test_mode: boolean;
  stripe_publishable_key: string;
  categories: string[];
  interests: string[];
  dietary_options: string[];
};

export type Booking = {
  id: string;
  meal_id: string;
  meal: Meal | null;
  guest: Host;
  guest_id: string;
  host_id: string;
  guest_count: number;
  subtotal_cents: number;
  service_fee_cents: number;
  total_cents: number;
  state: string;
  payment_status: string;
  cancellation_reason?: string | null;
  conversation_id?: string;
  can_review: boolean;
  reviewed: boolean;
  created_at?: string;
};

export type Conversation = {
  id: string;
  other_user: Host;
  meal_id?: string;
  meal_title?: string;
  meal_image?: string;
  last_message?: string | null;
  last_message_at?: string;
  unread: number;
  created_at?: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  type: "text" | "system" | "booking_request" | "booking_accepted";
  body: string;
  booking_id?: string | null;
  booking?: Booking | null;
  created_at?: string;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  meal_id?: string | null;
  booking_id?: string | null;
  conversation_id?: string | null;
  created_at?: string;
};
