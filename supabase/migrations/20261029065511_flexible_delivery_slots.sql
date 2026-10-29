-- The Innocent Kitchen: allow a date to have a custom set of delivery slots.
-- This migration has already been applied to production. Keep this file as source history;
-- do not run it again in the production SQL editor.
CREATE OR REPLACE FUNCTION public.save_delivery_slots(
  p_slot_date date,
  p_slots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO ''
AS $function$
DECLARE
  v_today date := (clock_timestamp() AT TIME ZONE 'Asia/Kolkata')::date;
  v_item jsonb;
  v_original_label text;
  v_label text;
  v_start time;
  v_end time;
  v_cutoff time;
  v_is_open boolean;
  v_capacity integer;
  v_item_count integer;
  v_saved integer := 0;
  v_order smallint := 0;
  v_reserved bigint;
  v_exists boolean;
  v_rows integer;
  v_idx integer := 0;
  v_j integer;
  v_starts time[] := ARRAY[]::time[];
  v_ends time[] := ARRAY[]::time[];
  v_labels text[] := ARRAY[]::text[];
  v_originals text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_kitchen_admin() THEN
    RAISE EXCEPTION 'Only kitchen administrators can change delivery slot settings';
  END IF;

  IF p_slot_date IS NULL OR p_slot_date < v_today OR p_slot_date > v_today + 180 THEN
    RAISE EXCEPTION 'Choose a slot date from today through the next 180 days';
  END IF;

  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array'
     OR jsonb_array_length(p_slots) < 1 OR jsonb_array_length(p_slots) > 12 THEN
    RAISE EXCEPTION 'A date must have between 1 and 12 delivery slots';
  END IF;
  v_item_count := jsonb_array_length(p_slots);

  -- Validate the entire submitted schedule before changing any rows.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_slots) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Each delivery slot must be an object';
    END IF;

    BEGIN
      v_start := NULLIF(BTRIM(COALESCE(v_item->>'start_time','')), '')::time;
      v_end := NULLIF(BTRIM(COALESCE(v_item->>'end_time','')), '')::time;
      v_cutoff := NULLIF(BTRIM(COALESCE(v_item->>'cutoff_time','')), '')::time;
      v_capacity := NULLIF(BTRIM(COALESCE(v_item->>'capacity','')), '')::integer;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Enter valid start, end, cut-off times and capacity for every slot';
    END;

    IF v_start IS NULL OR v_end IS NULL OR v_cutoff IS NULL OR v_capacity IS NULL THEN
      RAISE EXCEPTION 'Every slot needs start time, end time, cut-off time and capacity';
    END IF;
    IF jsonb_typeof(v_item->'is_open') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Every slot must specify whether it is open';
    END IF;
    v_is_open := (v_item->>'is_open')::boolean;

    IF v_start >= v_end THEN
      RAISE EXCEPTION 'Slot end time must be later than its start time';
    END IF;
    IF v_capacity < 1 OR v_capacity > 500 THEN
      RAISE EXCEPTION 'Capacity must be between 1 and 500 orders';
    END IF;
    IF v_cutoff > v_start OR v_cutoff < v_start - INTERVAL '4 hours' THEN
      RAISE EXCEPTION 'Cut-off must be no later than the start and no more than 4 hours earlier';
    END IF;

    v_label := TO_CHAR(v_start, 'FMHH12:MI AM') || ' – ' || TO_CHAR(v_end, 'FMHH12:MI AM');
    IF CHAR_LENGTH(v_label) > 80 THEN
      RAISE EXCEPTION 'The generated slot label is too long';
    END IF;
    IF v_label = ANY(v_labels) THEN
      RAISE EXCEPTION 'Duplicate delivery slot: %', v_label;
    END IF;

    v_original_label := NULLIF(BTRIM(COALESCE(v_item->>'original_slot_label','')), '');
    IF v_original_label IS NOT NULL THEN
      IF CHAR_LENGTH(v_original_label) > 80 THEN
        RAISE EXCEPTION 'An existing slot label is invalid';
      END IF;
      IF v_original_label = ANY(v_originals) THEN
        RAISE EXCEPTION 'The same existing slot was submitted more than once';
      END IF;
      v_originals := ARRAY_APPEND(v_originals, v_original_label);
    END IF;

    -- Do not allow overlapping delivery windows; adjacent windows are allowed.
    FOR v_j IN 1..v_idx LOOP
      IF v_start < v_ends[v_j] AND v_end > v_starts[v_j] THEN
        RAISE EXCEPTION 'Delivery slots must not overlap: % and %',
          v_labels[v_j], v_label;
      END IF;
    END LOOP;

    v_idx := v_idx + 1;
    v_starts := ARRAY_APPEND(v_starts, v_start);
    v_ends := ARRAY_APPEND(v_ends, v_end);
    v_labels := ARRAY_APPEND(v_labels, v_label);
  END LOOP;

  -- Save in time order so production-board sorting follows the slot schedule.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_slots)
    ORDER BY (value->>'start_time')::time
  LOOP
    v_start := (v_item->>'start_time')::time;
    v_end := (v_item->>'end_time')::time;
    v_cutoff := (v_item->>'cutoff_time')::time;
    v_capacity := (v_item->>'capacity')::integer;
    v_is_open := (v_item->>'is_open')::boolean;
    v_original_label := NULLIF(BTRIM(COALESCE(v_item->>'original_slot_label','')), '');
    v_label := TO_CHAR(v_start, 'FMHH12:MI AM') || ' – ' || TO_CHAR(v_end, 'FMHH12:MI AM');
    v_order := v_order + 1;

    -- If an existing slot's times are changed, keep its identity only when
    -- there are no associated non-cancelled/non-rejected orders.
    IF v_original_label IS NOT NULL AND v_original_label <> v_label THEN
      SELECT EXISTS (
        SELECT 1 FROM public.daily_delivery_slots s
        WHERE s.slot_date = p_slot_date AND s.slot_label = v_original_label
      ) INTO v_exists;

      IF v_exists THEN
        PERFORM 1 FROM public.daily_delivery_slots s
        WHERE s.slot_date = p_slot_date AND s.slot_label = v_original_label
        FOR UPDATE;

        SELECT COUNT(*) INTO v_reserved
        FROM public.customer_orders o
        WHERE o.fulfilment_type = 'scheduled'
          AND o.delivery_slot = v_original_label
          AND COALESCE(o.delivery_date, (o.created_at AT TIME ZONE 'Asia/Kolkata')::date) = p_slot_date
          AND o.order_status NOT IN ('rejected','cancelled');

        IF v_reserved > 0 THEN
          RAISE EXCEPTION 'Cannot change the time of % because orders are associated with it. Close it and add a new slot instead.', v_original_label;
        END IF;

        SELECT EXISTS (
          SELECT 1 FROM public.daily_delivery_slots s
          WHERE s.slot_date = p_slot_date AND s.slot_label = v_label
            AND s.slot_label <> v_original_label
        ) INTO v_exists;
        IF v_exists THEN
          RAISE EXCEPTION 'Another saved slot already uses the time window %', v_label;
        END IF;

        UPDATE public.daily_delivery_slots
        SET slot_label = v_label,
            start_time = v_start,
            end_time = v_end,
            cutoff_time = v_cutoff,
            capacity = v_capacity,
            is_open = v_is_open,
            sort_order = v_order,
            updated_at = NOW(),
            updated_by = auth.uid()
        WHERE slot_date = p_slot_date AND slot_label = v_original_label;
      END IF;
    END IF;

    INSERT INTO public.daily_delivery_slots
      (slot_date, slot_label, start_time, end_time, cutoff_time, capacity, is_open, sort_order, updated_at, updated_by)
    VALUES
      (p_slot_date, v_label, v_start, v_end, v_cutoff, v_capacity, v_is_open, v_order, NOW(), auth.uid())
    ON CONFLICT (slot_date, slot_label) DO UPDATE SET
      start_time = EXCLUDED.start_time,
      end_time = EXCLUDED.end_time,
      cutoff_time = EXCLUDED.cutoff_time,
      capacity = EXCLUDED.capacity,
      is_open = EXCLUDED.is_open,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW(),
      updated_by = auth.uid();

    v_saved := v_saved + 1;
  END LOOP;

  RETURN jsonb_build_object('slot_date', p_slot_date, 'saved_slots', v_saved, 'max_slots', 12);
END;
$function$;
