# WalkScene segments (Anterra-style)

Vertical path segments for the dungeon walk scene. Each image must have the
walkable path entering at the **bottom center** and exiting at the **top center**
so they can be stacked.

## Generate

```bash
npx tsx scripts/generate-walk-segments.ts --dungeon floresta
npx tsx scripts/generate-walk-segments.ts --dry-run
```

Output: `public/backgrounds/walk/<dungeonId>/<kind>.webp`

Until assets exist, `WalkScene` uses:

- **Floresta:** `/backgrounds/forest-dark-map.jpg` as a single strip
- **Others:** procedural canvas segments (seeded per run)

When at least one segment image loads for a dungeon, the scene switches to
seed-picked stitched segments.
