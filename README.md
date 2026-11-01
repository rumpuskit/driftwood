# Driftwood Island

A small island town where every TikTok follower of @driftwoodlive lives as a resident, growing with every new follower: https://driftwood.rumpuskit.com

## Core principle

Following is the only thing anyone has to do; every other feature is optional. Each resident's life (job, promotions, pet, daily plan) is computed **deterministically** from a seed derived from the username and the day. So the server never stores anyone's life, only the identity, the order (the address is computed from it) and requests. This design scales to 10 million residents.

## Where do residents come from?

TikTok doesn't provide the follower list through its official API, and the official "Download your data" file takes days. So the list is read from the account's public follower list through an independent profile viewer site (tik.ninja). That happens outside this repo, in a separate local follower tool (on a Mac, via launchd). The flow:

1. **Once an hour** the tool reads only the follower **count** from the profile and sends it to the server. Followers who haven't moved in yet wait at the Ferry Landing with their suitcases.
2. **Move-ins three times a day: 9 AM, 3 PM, 9 PM (ET)** (`web/src/config.js` `TASINMA_SAATLERI` and the tool's `config.toml`), the tool scans the list and sends all active followers, in follow order, over `ssh` to `tasinma.py` on the server. That ssh key can only run that script (forced command).
3. `tasinma.py` processes the list with `import_followers.aktar()`: newcomers move into empty homes first, in follow order; people who unfollowed leave (their home is kept for 7 days, then the record is deleted); people who asked to leave never move in again. If the list is smaller than 80% of the active population, it is not processed (a partial list must not empty the island).
4. At the same move-in, the tool reads the comments on videos from the last 30 days whose comment count changed and sends them after the list. `istekler.py` parses them (`job: fisherman`, `hobby: chess`, `pet: cat`, `hide my name` / `show my name`; only catalog options, staffed jobs excluded); `secim.py` handles `I'm running` and `vote: @handle` during a mayoral election. A request applies only to the commenter, and only if they live on the island, through the resident's `overrides` field; if they haven't moved in yet it waits 30 days. Comment text is never stored, and request records are deleted after 30 days. Verification comments (`code 1234`) are matched in the same pass.
5. The updated list goes to the Cloudflare Worker (`sayac/`, `driftwood-sayac` at https://driftwood-data.rumpuskit.com); the site reads the list from there. Visitor traffic never reaches the server.

TikTok leaves some accounts (such as private accounts) out of the public follower list; those can't move in and aren't counted as waiting at the Ferry Landing (the gap between the profile count and the population is `durum.disarida`). If tik.ninja shuts down, the official export file can be processed by hand with `import_followers.py`.

## How does the island grow?

The island starts empty: the Ferry Landing, dirt roads, an empty Town Green with a flagpole, Gull Point Light, Ocean Beach and the dune grass. Everything has a fixed spot, but only what has opened is built:

- **Homes** arrive with residents: cottages, two-family houses, fourplexes and apartments, depending on the neighborhood. A neighborhood fills from the street nearest the entrance outward; streets reach as far as the homes.
- **Places** open according to the `gelisim` table in `data/catalog.json`: Town Green benches at 5 residents, the Driftwood Diner at 10, the General Store at 20, the Bakery at 30... the island loop road with cars and the shuttle bus at 200, the freight terminal at 600, the last café at 2,650. Later neighborhoods get their church, ice cream parlor, school and community center at the same intervals once they start filling up; Main Street shops open one by one starting at the 240th resident.
- The development level is the **highest population the island has reached** (`zirve`); a place that has opened never closes because people unfollow.
- A resident whose workplace hasn't opened yet **works on the mainland, takes the ferry** until it does; the card says "Will be a baker when the Bakery opens (30 residents)". Once it opens, they switch to their real job.
- The site shows a "Next: … · N more residents" line, and the map shows a ghost outline of the next building behind a construction fence. The `acilan` list in the move-in output is material for move-in videos; the follower tool also sends a notification when a place opens.

## Layout

```
data/catalog.json          jobs, workplaces, hobbies, name lists (shared by web and server)
web/                       browser client (Three.js + Vite), opens on phones and in TikTok's in-app browser
  src/sim.js               deterministic simulation: hash, clock, address, a resident's day
  src/fmt.js               displayed formats: 12-hour clock, "Oct 31" dates, weekdays, numbers, feet and mph
  src/world/layout.js      island layout: neighborhoods, Main Street, shore, roads
  src/world/roads.js       asphalt, sidewalks, crosswalks, street lights
  src/world/city.js        homes, shops, street furniture (InstancedMesh)
  src/world/human.js       jointed human figure, props, dogs
  src/world/people.js      life on the street: walking, sitting, chatting, hobbies, work
  src/world/life.js        life at home: sleeping, meals, TV...
  src/world/interior.js    dollhouse interior view: the chosen floor is cut open, homes are furnished
  src/world/*.js           terrain, trees, sky, labels, textures
  src/ui.js                clock, speed, "find yourself" search and the resident card
  tests/parity_vectors.mjs JS output for the parity test
server/
  driftwood_sim/sim.py     Python port of the simulation (bit-for-bit the same as web)
  schema.sql               Postgres schema (residents, imports, requests)
  tasinma.py               count/list/comments from the follower tool on the Mac (ssh forced command)
  istekler.py              requests from comments or DMs (job, hobby, pet, hide name)
  secim.py                 mayoral election: candidates and votes from comments and the site
  import_followers.py      applies the follower list to the town, publishes the list (by hand: from a file)
  cikar.py                 residents who want to leave or hide their name (via DM)
  ortak.py                 psql, publishing the list (public/sakinler.json + Worker)
  tests/test_parity.py     do JS and Python give the same result?
  tests/test_tasinma.py    move-ins and comment requests end to end (needs a real Postgres, via DRIFTWOOD_TEST_DB)
  tests/test_istekler.py   parsing requests from comments
sayac/                     Cloudflare Worker driftwood-sayac: online counter, /sakinler.json, site API (verification, choices, polls)
```

## Commands

```sh
# Dev server (http://localhost:5173)
cd web && npm install && npm run dev

# URL options: ?nufus=12000 (sample population instead of the real list), ?gelisim=500 (show the island at that
# development level), ?bekleyen=40 (followers waiting at the Ferry Landing),
# ?test (60×/600× buttons), ?saat=21:30 (fixed time, with test/hiz), ?hiz=60 (time speed),
# ?bul=sakin_0042 (find and show a resident), ?bak=x,z,distance (camera)

# Parity and plan tests (needs Node)
cd server && python3 -m unittest -v

# Upload to the server ($SUNUCU: ssh alias; only /opt/driftwood)
rsync -a --delete --exclude __pycache__ --relative server/ data/catalog.json $SUNUCU:/opt/driftwood/app/
ssh $SUNUCU 'chown -R driftwood:driftwood /opt/driftwood/app'

# Move-in tests (throwaway Postgres; never touches the real database)
docker run -d --rm --name driftwood-deneme -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54391:5432 postgres:17-alpine
cd server && PGHOST=127.0.0.1 PGPORT=54391 PGUSER=postgres DRIFTWOOD_TEST_DB=driftwood_deneme python3 -m unittest tests.test_tasinma

# Process a list by hand (on the server; check with --dry-run first). Normally the follower tool sends it 3 times a day.
cd /opt/driftwood/app/server
sudo -u driftwood python3 import_followers.py liste.json --dry-run
sudo -u driftwood python3 import_followers.py tiktok-export.zip

# Request to leave / hide name (DM)
sudo -u driftwood python3 cikar.py username
sudo -u driftwood python3 cikar.py --gizle username

# Requests: try the parser, apply a request from a DM or live stream, list the last weeks' requests (requests video)
sudo -u driftwood python3 istekler.py dene "make me a fisherman please"
sudo -u driftwood python3 istekler.py ekle username meslek fisherman
sudo -u driftwood python3 istekler.py liste

# Worker (counter + list + site API)
cd sayac && npx wrangler@4 deploy
```

## Server rules

Other services also run on the server. Driftwood only uses the `driftwood` Linux user, the `/opt/driftwood` folder and the `driftwood` Postgres database. nginx, Redis and other services are never touched.

## Publishing

On every push to `main`, GitHub Actions runs the parity tests, builds the web client and publishes it to GitHub Pages: https://driftwood.rumpuskit.com (through Cloudflare).

## If a simulation rule changes

`web/src/sim.js` and `server/driftwood_sim/sim.py` change together, and the parity test is run. A rule change rewrites every resident's life retroactively. After launch, do it on purpose, as a "town event".
