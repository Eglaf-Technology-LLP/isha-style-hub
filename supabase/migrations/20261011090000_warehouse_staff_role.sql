-- Warehouse staff: people who receive, inspect, pack and dispatch parcels at
-- the AllBoutiqs warehouse. Their own role, not admin - they see only the
-- warehouse screens. Kept in its own migration: a new enum value can't be
-- used in the same transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'warehouse_staff';
