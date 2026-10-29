Supabase database maintenance notes
Project reference: demphpgcqtxapmqvlkdd (region ap-south-1).
Current production architecture
The production database contains customer orders, order items, status events, the kitchen-admin allowlist, shared recipe templates, menu availability, daily menus, daily delivery slots, and slot-wise production checklist data. Row-level security is enabled on the application tables.
The database has 14 recorded migrations through restore_invoker_rpc_wrappers. It also contains Phase 3 (daily menu), Phase 4 (delivery slots and capacity checks), and Phase 5 (slot production/dispatch) objects, but those phases do not yet have complete historical migration source files in this repository. The database migration ledger stores identifiers and names, not the SQL needed to recreate the schema.
Important deployment safety
Do not reset production or run a fresh-project migration push from this repository yet; the historical migration source is incomplete.
Treat the current production schema as authoritative until a complete, reviewed schema baseline is captured.
Add new schema changes as versioned SQL migrations and apply the same SQL that is committed here.
Keep the private schema out of Supabase Data API exposed schemas. Public RPC wrappers call its implementation functions internally.
Never commit a service-role or secret key. Browser files may contain only a publishable/anon key.
Keep RLS enabled and retain admin-only policies on menu editing, recipes, delivery slots, and production checklist rows.
Latest security migrations
20261028184834_final_audit_security_hardening.sql: narrows direct table grants and restricts order placement to signed-in customers.
20261028184924_restore_invoker_rpc_wrappers.sql: keeps public RPC wrappers as invoker functions and grants only the internal helper permissions required by those wrappers.
Remaining dashboard setting
The Supabase security advisor still flags Leaked Password Protection Disabled. This is an Auth configuration setting, not a database setting, so it cannot be changed through SQL. Enable leaked-password protection in the Supabase Dashboard under Authentication password/security settings. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
Phase 3–5 objects for the future migration baseline
Phase 3: daily_menu_days, daily_menu_items, save_daily_menu
Phase 4: daily_delivery_slots, customer_orders.delivery_date, save_delivery_slots, get_available_delivery_slots, get_delivery_slot_admin_summary, updated place_customer_order
Phase 5: delivery_slot_batch_checks and its admin-only RLS policies
