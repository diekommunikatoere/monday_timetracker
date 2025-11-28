# Database Migration Strategy

## Overview

This project uses individual migration files with numbered prefixes for each database object (tables, functions, indexes, policies, triggers, etc.) rather than cumulative migrations. Each migration file contains the complete definition of a single database object and can be updated independently. Numbered prefixes ensure Supabase applies them in the documented order via lexical filename sorting.

**Recommended approach for Supabase compatibility: Single file per category**

To avoid Supabase migration tracker conflicts (parses filename prefix before first '_' as 'version', e.g. all 002_* have version '002'), combine related objects into single files:

- `002_tables.sql` : all tables (concatenated in dependency order with comment separators)
- `003_functions.sql` : all functions (lexical filename order)
- `004_triggers.sql` : all triggers
- `005_indexes.sql` : all indexes
- `006_policies.sql` : all RLS policies
- `007_alters.sql` : all alterations

Benefits:

- Unique filename/version per category
- Simpler tracking (5-7 files total)
- Easy `supabase db reset`
- Internal order maintained with comments
- Git diffs show category-level changes

Fallback for individual files: pad prefixes for uniqueness (e.g. `00201_table_user_profiles.sql`, `00202_table_role.sql`) preserving lexical order.

## Usage

**Single category (preferred):**

- `cat ordered_objects > 002_tables.sql`

**Individual:**

- New table: `00201_table_foo.sql`
- Modify: Update file

## Migration Order

1. Extensions (`001_*`)
2. Tables (`002_*`)
3. Functions (`003_*`)
4. Triggers (`004_*`)
5. Indexes (`005_*`)
6. Policies (`006_*`)
7. Alters (`007_*`)

Supabase executes alphabetical, dependencies via prefix/order.
