# Major League Manager 2026 — The Big Show

A browser rebuild of the 1986 DOS game **Major League Manager**, using **current 2026 MLB active rosters and season stats**.

Made by **Maybee Creations**. In honor of the 1986 original. **Darren Maybee**, with credit towards **Bob Gardner**.

Play it the old way: 80-column CGA color text, an ASCII diamond, named fielders, two result boxes, and a five-page newspaper box score.

## Play locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173). Click the screen if keys do not respond.

```bash
npm run fetch-data   # optional: bake a fresh snapshot into the repo
npm run build
```

The game also **pulls latest MLB stats automatically once a week** when you open it (free public Stats API). Trades and created players are kept. Config option **6** forces a pull now.

## What’s in the box

- All 30 clubs, 26-man active rosters, 2026 hitting / pitching / fielding
- **Log5** pitcher–batter resolution (Bill James) — K, BB, HBP, 1B/2B/3B/HR, GB/FB, GIDP, SF, errors
- Manager keys from the original: **D G I O W / P R B S U / L H E M T**
- Exhibition games and a full **season** (standings, leaders, saved stats in the browser)
- Front office: trade, create, edit, and release players
- Computer manager for the other dugout (or both, if you just want to watch)

## Not affiliated

MLB names and stats are used for a personal historical-style simulation. This is not an official MLB product.

Source for the original: [Internet Archive — Major League Manager (1986)](https://archive.org/details/msdos_Major_League_Manager_1986)
