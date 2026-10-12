import { sql } from "drizzle-orm";

import type { Database } from "./index";

/**
 * Counts for its owner every spot that an operator accepted into the catalogue and that has no
 * row saying so yet: decision 041. Accepting writes that row itself. The version before this one
 * writes none, and may accept a spot while this one is being deployed: the API runs this each
 * time it starts, after the migrations, so that nothing accepted in between is left out. A
 * request whose break has since left the catalogue is counted too, under the spot's name. It
 * writes nothing twice, and the migration that added the rows' column runs the same statement.
 */
export async function creditPublications(db: Pick<Database, "execute">) {
  await db.execute(sql`
    insert into break_contribution
      (id, break_id, break_ref, user_id, line, value, status, license, decided_by, decided_at, confirmed_at, created_at)
    select gen_random_uuid()::text, p.break_id, coalesce(p.break_id, p.id), p.user_id, 'place',
           to_jsonb(coalesce(b.name, s.name)), 'confirmed', 'ODbL-1.0', p.decided_by, p.decided_at,
           coalesce(p.decided_at, p.created_at), p.created_at
    from spot_publication p
    join spot s on s.id = p.spot_id
    left join surf_break b on b.id = p.break_id
    where p.status = 'accepted'
      and not exists (
        select 1 from break_contribution c
        where c.line = 'place' and c.break_ref = coalesce(p.break_id, p.id)
      )
  `);
}
