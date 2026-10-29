Supabase database maintenance notes
Project reference: demphpgcqtxapmqvlkdd (region ap-south-1).
Current production state
The live production database currently contains customer orders, order items, order status events, the kitchen-admin allowlist, shared recipe templates, menu availability, daily menus, delivery slots, and the slot-wise production checklist. Row-level security is enabled on the application tables.
Important migration-history distinction
The Supabase database records 14 migration versions. However, the GitHub repository currently contains only the two final-audit SQL files under supabase/migrations/:
20261028184834_final_audit_security_hardening.sql
20261028184924_restore_invoker_rpc_wrappers.sql
The original SQL source files for the first 12 recorded Phase 1 and Phase 2 migrations are not currently in this GitHub repository. The Phase 3 daily-menu, Phase 4 delivery-slot, and Phase 5 production/dispatch objects exist in the live database, but their complete historical migration source is also not captured here.
The Supabase migration ledger records migration version identifiers and names; it does not contain the original SQL text. Consequently, this repository is not yet a complete rebuildable database history. Do not assume it can recreate the live database from an empty project.
Deployment safety
Do not reset the production database or run a fresh-project migration push from this repository until the complete schema baseline and missing source migrations have been reconstructed and reviewed.
Treat the current production schema and data as authoritative while that reconstruction is underway.
Do not rerun the two final-audit SQL files against production; their changes have already been applied.
Before any future migration is executed, compare it with the live schema, test it on a non-production database, and verify post-migration permissions and key application flows.
Keep the private schema out of Supabase Data API exposed schemas. The public RPC wrappers call private helper functions internally.
Never commit a Supabase service-role or secret key. Browser code may contain only a publishable/anon key.
Keep row-level security enabled and preserve admin-only policies for menu edits, recipes, delivery-slot settings, and production checklist rows.
Final-audit security changes already applied
Direct table mutation grants for anonymous clients were removed from the daily-menu and delivery-slot tables.
Order placement through place_customer_order_v2 is limited to authenticated customers.
Public RPC wrappers remain SECURITY INVOKER; narrowly required helper permissions are granted to their intended roles.
Anonymous access to the public delivery-slot RPC was tested after the changes and returned the six configured slots for the test date.
The Supabase security advisor no longer reports the earlier public SECURITY DEFINER RPC warnings.
Remaining Auth setting
The Supabase security advisor still reports Leaked Password Protection Disabled. The dashboard showed this requires the Pro plan or above. This is an Auth project setting, not a database migration. If the project remains on its current plan, it cannot be enabled through SQL. Consider increasing the minimum password length to at least 8 characters in Authentication settings.
Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
Reconstruction plan
Capture an authoritative schema baseline from the live database, including table definitions, constraints, indexes, row-level security policies, grants, triggers, and function bodies.
Recover or carefully reconstruct the missing Phase 1–5 migration source files in a separate review branch or folder; label reconstructed files as reconstructions rather than original historical SQL.
Reconcile migration version history only after the source files have been reviewed and tested against a clean non-production project.
Perform browser-level regression checks for customer sign-in and checkout, status tracking, UPI UTR submission, daily menu publishing, slot capacity and cutoff validation, shared recipe sync, and the production checklist.
Do not mark the database as fully reproducible until these steps are complete.
