-- Keep public RPC wrappers SECURITY INVOKER; the private schema is implementation-only.
CREATE OR REPLACE FUNCTION public.claim_customer_order(p_order_number text,p_tracking_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$ SELECT private.claim_customer_order(p_order_number,p_tracking_token); $function$;

CREATE OR REPLACE FUNCTION public.get_available_delivery_slots(p_slot_date date)
RETURNS TABLE(slot_date date,slot_label text,start_time time without time zone,end_time time without time zone,cutoff_time time without time zone,capacity integer,orders_reserved bigint,remaining integer)
LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$ SELECT * FROM private.get_available_delivery_slots_impl(p_slot_date); $function$;

CREATE OR REPLACE FUNCTION public.get_customer_order_status(p_order_number text,p_tracking_token text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$ SELECT private.get_customer_order_status(p_order_number,p_tracking_token); $function$;

CREATE OR REPLACE FUNCTION public.place_customer_order_v2(
  p_customer_name text,
  p_phone text,
  p_building text,
  p_room text,
  p_delivery_address text,
  p_fulfilment_type text,
  p_delivery_slot text,
  p_payment_method text,
  p_notes text,
  p_items jsonb,
  p_total_amount numeric,
  p_tracking_token text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT private.place_customer_order_v2(
    p_customer_name,p_phone,p_building,p_room,p_delivery_address,
    p_fulfilment_type,p_delivery_slot,p_payment_method,p_notes,
    p_items,p_total_amount,p_tracking_token
  );
$function$;

CREATE OR REPLACE FUNCTION public.report_upi_payment(p_order_number text,p_tracking_token text,p_utr text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$ SELECT private.report_upi_payment(p_order_number,p_tracking_token,p_utr); $function$;

CREATE OR REPLACE FUNCTION public.report_upi_payment_for_customer(p_order_number text,p_utr text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
AS $function$ SELECT private.report_upi_payment_for_customer(p_order_number,p_utr); $function$;

GRANT USAGE ON SCHEMA private TO anon,authenticated;

GRANT EXECUTE ON FUNCTION private.get_available_delivery_slots_impl(date)
TO anon,authenticated;

GRANT EXECUTE ON FUNCTION private.get_customer_order_status(text,text)
TO anon,authenticated;

GRANT EXECUTE ON FUNCTION private.report_upi_payment(text,text,text)
TO anon,authenticated;

GRANT EXECUTE ON FUNCTION private.claim_customer_order(text,text)
TO authenticated;

GRANT EXECUTE ON FUNCTION private.place_customer_order_v2(
  text,text,text,text,text,text,text,text,text,jsonb,numeric,text
)
TO authenticated;

GRANT EXECUTE ON FUNCTION private.report_upi_payment_for_customer(text,text)
TO authenticated;
