# Daily photocard draws

Branch: `feature/daily-card-draw`. Apply these SQL files in Supabase SQL Editor, in order:

1. `supabase/migrations/202611150001_daily_draw.sql`
2. `supabase/migrations/202611150002_draw_pool.sql`

Requires the existing user_cards and acquisition_method migrations. The first migration is applied once. Refresh the pool after catalog changes with `node scripts/generate-draw-pool.mjs`, then run the generated pool SQL.

Each authenticated account receives 20 free draws per Korean calendar day. Duplicate cards consume a draw but do not duplicate collection entries. A transaction lock serializes concurrent requests for the account. Draw history is server-written and remains when a collection entry is removed. All pool cards have equal probability. Photo verification remains independent of draw history.

`card_provenance(owner_id)` returns photo verification and draw provenance for an owner's currently collected cards, for reuse by public album views. The existing app does not yet provide a working other-user album route; connecting that route remains outstanding.

Verification required after applying SQL: anonymous rejection, two concurrent requests at 19 draws (only one succeeds), account isolation, midnight reset, duplicate draws, removal without allowance recovery, and combined photo/draw badges. The SQL has not been executed against the hosted database by this change.
