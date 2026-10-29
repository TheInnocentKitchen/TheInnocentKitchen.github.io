-- Initial final-audit hardening. The next migration restores public wrappers to
-- SECURITY INVOKER to avoid introducing public SECURITY DEFINER RPCs.
CREATE OR REPLACE FUNCTION public.claim_customer_order(p_order_number text,p_tracking_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT private.claim_customer_order(p_order_number,p_tracking_token); $function$;
CREATE OR REPLACE FUNCTION public.get_available_delivery_slots(p_slot_date date)
RETURNS TABLE(slot_date date,slot_label text,start_time time without time zone,end_time time without time zone,cutoff_time time without time zone,capacity integer,orders_reserved bigint,remaining integer)
LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT * FROM private.get_available_delivery_slots_impl(p_slot_date); $function$;
CREATE OR REPLACE FUNCTION public.get_customer_order_status(p_order_number text,p_tracking_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT private.get_customer_order_status(p_order_number,p_tracking_token); $function$;
CREATE OR REPLACE FUNCTION public.place_customer_order_v2(p_customer_name text,p_phone text,p_building text,p_room text,p_delivery_address text,p_fulfilment_type text,p_delivery_slot text,p_payment_method text,p_notes text,p_items jsonb,p_total_amount numeric,p_tracking_token text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT private.place_customer_order_v2(p_customer_name,p_phone,p_building,p_room,p_delivery_address,p_fulfilment_type,p_delivery_slot,p_payment_method,p_notes,p_items,p_total_amount,p_tracking_token); $function$;
CREATE OR REPLACE FUNCTION public.report_upi_payment(p_order_number text,p_tracking_token text,p_utr text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT private.report_upi_payment(p_order_number,p_tracking_token,p_utr); $function$;
CREATE OR REPLACE FUNCTION public.report_upi_payment_for_customer(p_order_number text,p_utr text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO ''
AS $function$ SELECT private.report_upi_payment_for_customer(p_order_number,p_utr); $function$;

REVOKE ALL ON SCHEMA private FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC,anon,authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.customer_orders,public.customer_order_items,public.kitchen_admins,public.order_status_events,public.kitchen_recipe_templates,public.menu_availability,public.daily_menu_days,public.daily_menu_items,public.daily_delivery_slots,public.delivery_slot_batch_checks FROM anon,authenticated;
GRANT SELECT,UPDATE ON TABLE public.customer_orders TO authenticated;
GRANT SELECT ON TABLE public.customer_order_items,public.order_status_events,public.kitchen_admins TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.kitchen_recipe_templates TO authenticated;
GRANT SELECT ON TABLE public.menu_availability TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.menu_availability TO authenticated;
GRANT SELECT ON TABLE public.daily_menu_days,public.daily_menu_items TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.daily_menu_days,public.daily_menu_items TO authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.daily_delivery_slots TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.delivery_slot_batch_checks TO authenticated;
REVOKE EXECUTE ON FUNCTION public.place_customer_order_v2(text,text,text,text,text,text,text,text,text,jsonb,numeric,text) FROM anon,PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_customer_order_v2(text,text,text,text,text,text,text,text,text,jsonb,numeric,text) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.enforce_customer_order_transitions() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_unavailable_order_item() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.log_customer_order_events() FROM PUBLIC,anon,authenticated;

