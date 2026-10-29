DROP POLICY IF EXISTS "published daily menus readable"
ON public.daily_menu_days;

DROP POLICY IF EXISTS "kitchen admins can read all daily menu days"
ON public.daily_menu_days;

CREATE POLICY "published daily menus readable"
ON public.daily_menu_days
FOR SELECT TO anon, authenticated
USING (is_published = true);

CREATE POLICY "kitchen admins can read all daily menu days"
ON public.daily_menu_days
FOR SELECT TO authenticated
USING ((SELECT public.is_kitchen_admin()));

DROP POLICY IF EXISTS "published daily menu items readable"
ON public.daily_menu_items;

DROP POLICY IF EXISTS "kitchen admins can read all daily menu items"
ON public.daily_menu_items;

CREATE POLICY "published daily menu items readable"
ON public.daily_menu_items
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.daily_menu_days d
    WHERE d.menu_date = daily_menu_items.menu_date
      AND d.is_published = true
  )
);

CREATE POLICY "kitchen admins can read all daily menu items"
ON public.daily_menu_items
FOR SELECT TO authenticated
USING ((SELECT public.is_kitchen_admin()));
