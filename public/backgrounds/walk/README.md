# WalkScene segments (Anterra-style)

Vertical path segments for the dungeon walk scene. Each image must have the
walkable path entering at the **bottom center** and exiting at the **top center**
so they can be stacked / scrolled.

## Floresta Sombria (canonical)

Generated from landing celestial art (`hero-masmorra-floresta-celestial.webp`):

```bash
npx tsx scripts/generate-floresta-scene-art.ts
```

- `public/backgrounds/floresta-battle.webp` — combat backdrop
- `public/backgrounds/floresta-walk-map.webp` — treadmill walk strip

## Other dungeons (segments)

```bash
npx tsx scripts/generate-walk-segments.ts --dungeon caverna
```

Until assets exist, `WalkScene` uses procedural canvas segments (seeded per run).
