# CryptoLand Viral Strategy — 2026/2027 Playbook

> Goal: become the #1 most-celebrated land game of 2026/27. Word-of-mouth growth without paid marketing. Users share without prompting because the share IS the experience.

This document is the strategic foundation for product/feature decisions. It is the result of a deep study of how comparable products achieved viral lift-off and where they failed to sustain it. The core insight: **the share artifact must be inseparable from gameplay**. If sharing is an extra step, sharing dies. If sharing IS the game, growth compounds.

---

## 1. Competitive Intelligence — what actually drove virality

| Product | Year | What went viral | Why |
|---|---|---|---|
| Million Dollar Homepage | 2005 | Finite 1M-pixel grid sold for $1/ea | Bounded scarcity + permanence + press magnet |
| Pokémon Go | 2016 | Geo-AR layer over real cities | Tribal teams (Mystic/Valor/Instinct) + physical embodiment |
| Earth2 | 2020-21 | "Buy a tile of your house" | First-mover narrative + screenshot-of-your-property |
| Upland | 2020+ | Property tycoon + collections | Real cities + status tiers (Visitor → Director) |
| Wordle | 2022 | Spoiler-free emoji grid | One puzzle/day + shareable result that doesn't ruin it |
| BeReal | 2022 | 2-min daily window | Time-window scarcity + must-post-to-see gating |
| Geoguessr | revival 2022+ | Rainbolt's TikToks | Skill clips short enough for TikTok, identifiable in 0.1s |
| Atlas Earth | 2022+ | Passive cashback rent | "A parcel sells every 6 sec" — visible scarcity ticker |
| Worldle | 2022 | Country silhouette guess | Daily window + emoji result + geo-curiosity |

### Patterns we extract

1. **Finite + permanent + visible** → people brag. Million Dollar Homepage proved "I own that pixel" was post-worthy in 2005. We have **268M tiles** — bigger universe but same principle, scaled to identity ("I own MY street").
2. **Spoiler-free shareable result** → people repost. Wordle's emoji grid was the single greatest viral export of the 2020s. **Our equivalent must exist**.
3. **Time-window scarcity** → people log in every day. BeReal proved a daily 2-minute window is enough. We need a **daily-only event** that ties to ownership.
4. **Identity tribes** → people defend turf. Pokémon Go teams, Earth2 country wars, Upland status tiers. **CryptoLand already has Country Wars; we need to amplify them**.
5. **Skill-flex content** → creators make us viral. Rainbolt-style 30-second clips. We need **tile-level achievements that look impressive in a screenshot**.
6. **Real-world hook** → the share lands beyond crypto Twitter. "I bought my high school" is shareable to non-crypto friends. **The certificate must emphasise the human story over the on-chain proof**.
7. **Loss-averse streaks** → people don't quit. Wordle streak, Snap streak, BeReal streak. **Daily check-in or daily defense earns a streak**.
8. **Asymmetric stakes** → people gamble. Raids already do this. We can extend to **prediction-market on the price of any tile**.

### Why the existing CryptoLand stack is *unfairly* well-positioned

- **Real geo + crypto + AI agents in one product.** No competitor has all three. Earth2 is geo-only; Decentraland/Sandbox are non-real-world; Atlas Earth has no agent layer; Pokémon Go has no ownership.
- **Guardian agents act as 24/7 brokers/defenders.** This is the *agentic gaming* narrative that 2026 will be obsessed with.
- **268M tiles ≈ every street on Earth.** Every user can find their own house. Wordle had 1 board/day; we have 268M ownable identities.
- **Multi-chain wallet abstraction** exists already (Polygon, Base, Solana). Onboarding friction is low.
- **Affiliate code system already shipped.** 30% commissions deterministically per user. The viral loop has a financial floor.

---

## 2. Ten unfair-advantage features — ranked by viral × novelty

Each scored 1-10 on: **Viral potential**, **Novelty (nobody did it)**, **Build effort (lower = better)**, **Defensibility**.

### #1 — `LandShare` Daily Card (Wordle-for-Land)
**V:10 N:9 B:3 D:8**

Every 24h, every owner gets a generated **"Empire Card"** — a single PNG/SVG with their tile silhouettes plotted on a world map, country medals, top headline ("You own 14 tiles in 3 countries — $487 net worth, +$32 today"). One-click share to X/Telegram/iMessage with the URL deep-linking back to a viewer page that shows that exact card.

**Why viral**: Wordle's emoji grid principle. The card is the share. Recipients open the link, see live stats, and the obvious next thought is "what does mine look like?" → they buy a tile to find out.

**Why nobody did it**: Earth2/Upland have profile pages but they're not daily-refreshed share artifacts. The daily refresh creates BeReal-style cadence.

### #2 — `ScreamingDeed` Certificate v2 (Auto-narrative)
**V:9 N:8 B:4 D:7**

Each tile already has a generated narrative (we just rebuilt this). Wrap it into a **printable, shareable, frame-worthy deed** with:
- Country flag, tile coords, owner handle, mint date
- The auto-generated regional story
- A QR code → public certificate URL on xono.ai/c/{tileKey}
- A "What this place would mean to a stranger" line generated from coordinates

**Why viral**: People print these. People frame them. People gift them. "I bought my dad his hometown for his birthday" is a TikTok genre waiting to happen.

**Why nobody did it**: Existing land games' "deeds" are bland NFT JSON. The narrative + QR + framable design is a content artifact, not a token.

### #3 — `CountryWars` Live Leaderboard + Daily Conquest
**V:9 N:7 B:5 D:6**

Country War already exists in MarketSidebar. Amplify:
- A **24h "Today's Conquest"** widget: which country gained the most tiles today, with a flag-vs-flag duel UI
- **National rankings** of top 3 owners per country, with crown badges that appear on their tile overlays
- A **"Defend Your Country" alert** — when foreigners are buying in your country faster than locals, push notification

**Why viral**: Tribal psychology. Pokémon Go teams. National pride is the most reliable engagement driver in any product that touches geography. Argentina vs Brazil, India vs Pakistan, USA vs anywhere — the rivalry writes itself.

**Why nobody did it well**: Earth2 has country leaderboards but no *time-bounded daily contest*. Daily windows + national pride + crown badges = posts to country-specific subreddits, Telegrams, WhatsApp groups.

### #4 — `OwnYourSchool` / Personal Place Onboarding
**V:10 N:8 B:3 D:9**

First-time users land on a **search bar that says "Find your home, school, or favorite place"**. As they search, they see the tile they'd own + price + a preview certificate with their name on it. The funnel is:
1. Search → see your house
2. See "$3.20" price tag with your name on the deed preview
3. One-click connect wallet/email
4. Own it forever

**Why viral**: Everyone has a sentimental place. The barrier from intent → ownership is < 30 seconds. The share is automatic ("look I own my elementary school"). The TikTok genre — "watch me buy my old neighbourhood" — already exists for Earth2; we make the funnel tighter.

**Why nobody did it well**: Earth2 charges too much ($60 minimum tile in many regions). Upland/Decentraland have no real-world geocoding. Atlas Earth has it but it's mobile-only and dressed as a cashback gimmick.

### #5 — `TileVoyeur` — see who's looking at YOUR tile
**V:8 N:10 B:4 D:7**

When someone hovers over your owned tile, you get a soft notification ("3 people are eyeing your Manhattan tile right now"). On the map, your tiles get a subtle **pulse** when viewer count spikes. Optional: anonymous "viewer dots" near your tiles.

**Why viral**: Endowment effect amplified. Once you know strangers are watching your land, you check more often. Once you check more often, you buy more land to be checked more. Same feedback loop that made Tinder-likes addictive.

**Why nobody did it**: Privacy/UX tightrope. We can do it because tiles are public objects (not user accounts). True 10/10 novelty.

### #6 — `WhalePrediction` — bet on tile prices
**V:8 N:8 B:6 D:7**

Each tile has a current price. Let anyone open a **"Will this tile sell within 7 days?"** prediction with $1 stake. Resolved automatically by `purchased_at`. Winners split the pot minus 5% house. Adds a layer of **micro-gambling on every empty tile**, which is the most addictive UI loop ever invented.

**Why viral**: Polymarket showed prediction markets are content. Polygon-native, sub-cent gas. Each prediction creates a share-worthy "I called it" moment.

**Why nobody did it well**: Earth2 has speculation but no formal market. We layer it on existing pricing without changing the core game.

### #7 — `Streak Empire` — daily check-in defense
**V:9 N:6 B:2 D:8**

Snap-streak / Wordle-streak applied to land. Every day you log in, you "defend" your tiles for free. Miss a day, you lose the streak. After 7-day streak: tiles get a **🔥 streak badge** on the map, visible to all. After 30-day streak: tiles get a **shimmer animation**. After 100-day streak: tiles get a **gold border on the public certificate**.

**Why viral**: Loss aversion. Snapchat's #1 retention feature for a decade. Cheap to build (we have the user table + a date column). Visible badges on map make the streak public, which creates a Veblen-good dynamic (people brag about their streak length).

**Why nobody did it**: Land games haven't internalized B2C streak mechanics. They borrow from finance/RPG instead of from social. We borrow from social.

### #8 — `BrokerAI` — public AI broker reports for every owner
**V:7 N:10 B:5 D:9**

Guardian agents already monitor prices. Make their output **public reports** that owners can publish to a feed:
- "Guardian #4231 reports: Belgium sales are up 14% this week. Recommendation: hold."
- "Guardian #71 reports: Tokyo Bay foot traffic spiking. Targeted accumulation."

Each owner can opt to make their broker's reports public, building a follower base. Top brokers get a **Verified Broker** badge.

**Why viral**: The 2026 obsession is agentic. Watching an AI manage your portfolio publicly is the spectator-financial-content of the year. Think "ChatGPT plays Pokémon" but with money on the line and real geography.

**Why nobody did it**: We're the only stack with all three layers (geo + crypto + agents). This is our moat.

### #9 — `Trophy Cabinet` — public empire viewer page
**V:8 N:7 B:3 D:8**

Public, SEO-indexed page at `xono.ai/u/{handle}` showing:
- Mini-globe with all owned tiles glowing
- Country medals 🥇🥈🥉
- Total volume, tile count, longest streak, top trades
- Live "viewers right now" counter
- Trophy case: "First to own a tile in 12 countries", "Owns the highest-priced Tokyo tile", etc.

Recipients of LandShare cards land here. URL is share-optimized.

**Why viral**: This is the **destination** for every shared link. SEO indexing makes "{name} cryptoland" a search query. Achievement badges fuel screenshots.

**Why nobody did it well**: Existing portfolios are gated behind logins. Ours is public-by-default with live data.

### #10 — `Drop Day` — daily 1000-tile flash drop
**V:9 N:7 B:4 D:6**

Once per day, **1,000 hand-curated "premium" tiles** (famous landmarks, viral spots) are released for a 60-minute window. Pre-announced 24h in advance. Notification to all users. Sells out in minutes. Creates a **daily sneaker-drop event**.

**Why viral**: Sneaker culture's drop model + Wordle's daily cadence + Earth2's land-rush narrative. Streamers can cover the drop live. Discord/TG chat explodes during the window.

**Why nobody did it**: Atlas Earth has no curation, Earth2 launched all land at once. Daily curated drops are a Supreme/SNKRS playbook never applied to land.

### Honourable mentions (V:6-7 range)
- **Inheritance** — designate a wallet to inherit your tiles in N years (legacy hook)
- **Guild Maps** — clans pool tiles for collective country dominance
- **Proof-of-visit** — visit a real-world tile location, scan QR, get a +XP bonus on it
- **Live auctions** — Sotheby's-style 60s English auction for premium tiles
- **Memorial tiles** — gift a tile to a deceased loved one's hometown, gets a candle icon

---

## 3. Selected for v1 implementation (this PR)

After scoring viral potential against build effort and our existing stack:

| # | Feature | Reason chosen |
|---|---|---|
| 1 | **LandShare Daily Card** | Highest viral score. Wordle-class share artifact. Builds on existing data. |
| 2 | **Streak Empire** | Lowest build cost, highest retention impact. One DB column + a badge. |
| 3 | **Trophy Cabinet (public empire page)** | The landing surface for every shared link. SEO compounding. |
| 4 | **Personal Place Onboarding** | Conversion booster for traffic generated by 1+3. |

The combination is intentional: #1 generates outbound shares → those shares land on #3 → which converts via #4 → users return daily for #2.

We deliberately defer:
- **WhalePrediction** — needs settled UX research, regulatory care
- **BrokerAI** — needs Guardian opt-in flows + content moderation
- **Drop Day** — needs editorial curation pipeline
- **Country Wars amplification** — already partly shipped; will iterate

---

## 4. Implementation plan (what ships in this PR)

### Backend (`server/main.py`)
- New `streaks` table: `user_id, current_streak, longest_streak, last_checkin_at, total_checkins`
- New `share_cards` table: `card_id, user_id, generated_at, payload_json` (cached daily card)
- New endpoints:
  - `POST /streak/checkin` — record a daily check-in, increment or reset streak
  - `GET /streak/me` — current user streak
  - `GET /streak/leaderboard` — top streaks globally
  - `GET /share/card/{handle}` — fetch (or generate) today's empire card data
  - `GET /u/{handle}` — public empire page data (tiles + stats + medals + streak)
  - `GET /search/place?q=...` — proxy to Nominatim for personal place onboarding

### Frontend
- `src/store/streakStore.js` — streak state + actions
- `src/store/shareStore.js` — daily card state
- `src/components/EmpireCard.jsx` — the shareable PNG/SVG card (download + copy-link buttons)
- `src/components/PublicEmpire.jsx` — `/u/{handle}` viewer page (route-based)
- `src/components/StreakBadge.jsx` — overlay badge for streaked tiles
- `src/components/PersonalPlaceOnboarding.jsx` — first-load search + claim flow
- Map.jsx — render 🔥 streak badge on tiles owned by streaked users
- HUD.jsx — streak counter chip + daily check-in button

### Cross-cutting
- Public route `/u/:handle` and `/c/:tileKey` — needs router or hash-based routing
- Open Graph meta tags for shared URLs (so previews look great in iMessage/WhatsApp/Telegram)
- A small route handler in FastAPI that serves SSR'd OG tags for share URLs

---

## 5. Success metrics (90 days post-launch)

| Metric | Target |
|---|---|
| Daily share clicks (any LandShare card opened) | 10k/day |
| Conversion from shared link → tile purchase | ≥ 4% |
| 7-day streak holders | ≥ 8% of MAU |
| Public empire page views | 50k/day organic |
| % users who return next day after first purchase | ≥ 40% |
| K-factor (new users per existing user per week) | ≥ 0.6 |

If K > 1 sustained for 8 weeks → exponential growth phase. If K stalls at 0.5-0.8 → iterate on share artifact design (the card itself is the lever).

---

## 6. Why this works (synthesis)

The viral product is not the game. The viral product is **the share artifact the game produces**. CryptoLand's share artifact is now:

> **A shareable card showing your real-world tiles glowing on a globe, with a streak number, country medals, and the price you paid. Opened from any app, it links to your public empire page, which shows live data and a "claim your own" CTA.**

That single object — the EmpireCard — is the entire growth engine. Every other feature is in service of generating, distributing, or rewarding it.

If we get the artifact right, growth happens *to us*. If we get it wrong, no marketing budget will save us.

This PR ships the artifact, the streak that makes it daily, the page it links to, and the onboarding that converts the visitor.
