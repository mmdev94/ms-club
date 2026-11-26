# MS Club

Texas Hold'em with friends and funny AI players, in the browser — no account, no game server. Play chips only, never real money.

## The regulars, at three levels

| Level | How they play |
|---|---|
| Easy | Win chance against random cards, plus some plain mistakes. |
| Normal | Pre-flop hand charts by seat position, all-in-or-fold when short, continuation bets, semi-bluffs with draws, value bets sized to hand strength. |
| Hard | Normal + reads each opponent's likely hands from their actions, and learns over the session how each player plays (how often they fold, call, bluff) to exploit it. |

Measured with `scripts/arena.ts`: 3,000 deals per seating, every deal played twice with seats swapped so card luck cancels out; big blinds won per 100 hands (bb/100):

| | Easy | Normal | Hard |
|---|---:|---:|---:|
| vs Easy (heads-up) | — | +41.8 | +127.3 |
| vs a player who calls everything | +128.5 | +242.9 | +345.5 |
| vs a player who folds to every bet | +31.1 | +30.7 | +40.0 |

Hard vs Normal heads-up: +2.7 bb/100. Everything runs in the browser; the pre-flop tier chart is adapted from [poker-ai-coach](https://github.com/ArTeria21/poker-ai-coach) (MIT) — see NOTICE.

## Play with friends

"Play with friends" opens a private table and gives you a link. Friends join from any browser — no account, no server:

- Browsers find each other through public Nostr relays (only to exchange connection details) and then talk directly over WebRTC ([trystero](https://github.com/dmotz/trystero)).
- The host's browser runs the game. The room's admin key makes the host verifiable, and only the host can change the table.
- Each friend is sent the hand with everyone else's cards hidden until they are shown at showdown; their moves come back and are checked before they count.
- Empty seats are played by the regulars at the host's level. Friends who join late take a bot's seat at the next hand; friends who leave are replaced by a bot (with their chips). 30 seconds per turn.
- Honest limit: the host's browser knows all the cards. Play with people you trust; a provably fair shuffle is planned.

`room-test.html` is the connection test for online tables (WebRTC rooms via [trystero](https://github.com/dmotz/trystero), meeting through public Nostr relays).

## Run it

```bash
pnpm install
pnpm build && pnpm preview     # serves with the same security policy ms.computer adds
```

MIT licensed.
