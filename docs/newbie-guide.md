# NEWBIE crash course

`/newbie` is a public, lazy-loaded first-session guide. Desktop **Wiki → NEWBIE**
and mobile **More → NEWBIE** place it immediately before **Guide**. It is outside
the access-gated `/wiki` route tree so a visitor can read it before creating an
account. The existing help-file library stays at `/guide`.

The page uses the [Design guide](DESIGN.md), shared brand/UI components, its own
full-bleed gutters, and the application's scrolling `main`. Chapter links move
focus to their section, respect reduced motion, and retain native fragment hrefs.
The command search is local, case-insensitive, and searches command syntax,
explanations, and categories. The page has no game connection, account mutation,
new API, dependency, storage, or analytics behavior. Site branding in the page
title uses the existing site-config composable; the static lesson remains readable
when that configuration is unavailable.

## Watch Duris

The video showcase sits between the chapter navigation and the first lesson.
Both the hero and chapter navigation link to `#watch`, using the same focus and
reduced-motion behavior as the lessons. Three portrait cards use the eclipse
tokens, shared display typography and existing Button; they form a three-column
grid above 760px and a centered single column on narrower screens.

The owner supplied these Luminari MUD YouTube Shorts. Titles and publisher were
verified with YouTube's oEmbed metadata on **2026-10-30**:

- [New player creation](https://www.youtube.com/shorts/B0z2x4ngaeo)
- [Player vs. player](https://www.youtube.com/shorts/hrpmW41xkKo)
- [Exploring a dragon lair](https://www.youtube.com/shorts/BTr7aWM80ts)

Preview images load lazily from `i.ytimg.com`; no video media is copied into
the repository. A click creates a titled `youtube-nocookie.com` iframe and moves
focus into it. Only one player mounts at a time; selecting another removes the
previous player. Closing restores focus to that video's play button. The iframe
uses `strict-origin-when-cross-origin` so YouTube receives the origin referrer it
requires for embedded playback. Each card retains a direct YouTube link if
embedding or playback is unavailable. The page identifies YouTube as the player
provider; click-to-load does not claim that third-party playback is tracking-free.

## Gameplay evidence

Reviewed against the locally available DurisMUD source on **2026-10-29**, commit
[`9632f29804687ccf049ddf7a59a5ae16878e0583`](https://github.com/LuminariMUD/Duris/tree/9632f29804687ccf049ddf7a59a5ae16878e0583).
This is a source review, not a claim about the deployed MUD revision or live
settings. The MUD checkout was inspected read-only.

Paths below are relative to that separate repository. Recheck the owning code,
not just legacy help text, when changing gameplay guidance:

- **Creation and introductions:** `src/account/nanny.c`, `select_newbie`,
  `prompt_hardcore_or_class`, and `creation_hometown_available`; hometown labels
  in `src/core/constant.c`. Plane of Life and Plane of Chaos are beginner
  introductions; Ailvio and Wutvr are secondary introductions. Available
  hometowns depend on race and racewar side. Do not promise every new character
  starts in Ailvio or publish fixed character-build choices from the old wiki.
- **Basic commands and aliases:** `src/cmd/interp.c` command names and
  registrations; `src/cmd/actinf.c` for looking, status, equipment, exits, and
  `do_consider`. Consider compares levels only; it cannot guarantee a safe fight.
- **Combat and fleeing:** `src/cmd/actoff.c`, `do_kill` and `do_flee`, and
  `src/combat/fight.c`. Escape can fail, consumes movement, and is restricted by
  character state. No fixed success rate or universal escape route is promised.
- **Gear, food, and looting:** `src/cmd/actobj.c` and the tracked help entries
  for equipment, wear, wield, eat, drink, get, and corpses. Shop services are
  context-sensitive; `list` is the entry point rather than a fixed price list.
- **Training and magic:** `src/guild/guild.c`, `do_practice`;
  `src/classes/memorize.c`, `do_memorize` and `do_scribe`;
  `src/net/sparser.c`, `do_cast`; tracked Practice, Memorize, Scribe, and Cast help.
  Preparation depends on class; the course directs
  players to the relevant help rather than assuming every caster uses mana or
  the same book/preparation routine.
- **Communication and groups:** `src/cmd/actwiz.c`, `do_nchat`;
  `src/cmd/actnew.c`, `do_consent`; `src/cmd/actmove.c`, `do_follow`;
  `src/guild/group.c`, `do_group`; tracked
  Group, Consent, and Assist help. Following and group membership are separate.
  `src/cmd/actinf.c`, `do_recall`, displays private-message history, not travel.
- **Death:** `src/combat/fight.c` calls `death_exp_loss_level_threshold()` from
  `src/world/limits.c`. The universal cutoff defaults to 30 but comes from
  `exp.goodieDeathExpLossLevelThreshold`; the level-up warning uses its effective
  value. The course deliberately does not state a fixed live cutoff or guarantee
  gear recovery, replacement equipment, immunity from PvP, or hardcore survival.
- **Logout:** `src/cmd/interp.c` maps `CMD_QUIT` to `do_camp` in
  `src/cmd/actoth.c`. Camping has terrain, state, town, and timing restrictions.
  The inn handler in `src/specs/specs.room.c` handles `rent`, restrictions, and
  terminal saving. Neither `save` nor closing a client is a completed logout.
- **Browser commands and pager:** this repository's
  [frontend guide](../frontend/README_frontend.md#game-commands-and-paging),
  `frontend/src/components/mud/MudCommandInput.vue`, and game-transport tests own
  empty Enter, `q`, command history, and Escape behavior.

The [Fandom Beginners Guide](https://duris.fandom.com/wiki/Beginners_Guide_to_Duris)
provided topic inspiration only. All course prose is newly written; no Fandom
artwork, maps, or passages are reproduced. The course does not inherit historical
server addresses, race statistics, town directions, bank fees, or level caps.
Artwork is decorative and does not depict an authoritative in-game location.
See the [image record and exact prompts](../frontend/src/assets/newbie/README.md).

## Website Changelog draft

This is a future-release draft, **not published**. At deployment, reconcile it
with existing entries/drafts using the [news-update skill](../.agents/skills/news-update/SKILL.md),
assign the verified deployment date/version, and publish only after acceptance.
No changelog database write is required for this review-only PR.

- Title: **Your first adventure starts here**
- Category: `public`
- Version: use the verified release date in the existing `YYYY.MM.DD` convention.
- HTML:

```html
<h3>Wiki</h3>
<ul>
  <li><strong>New to Duris?</strong> Open <a href="/newbie">NEWBIE</a>, just above Guide in the Wiki menu (or More on your phone), for an illustrated first-session crash course.</li>
  <li>Learn how to explore, choose a fight, recover, join a group, and leave the game safely. A searchable command reference keeps the basics close at hand.</li>
</ul>
```

### Video showcase release draft

Reconcile this separate future-release update at deployment; it has **not been
published**. Use the verified release date/version and category `public`.

- Title: **See Duris in action**
- HTML:

```html
<h3>NEWBIE</h3>
<ul>
  <li><strong>A world of words, in action.</strong> The <a href="/newbie">NEWBIE crash course</a> now features three YouTube Shorts from Luminari MUD: character creation, player combat, and exploring a dragon lair.</li>
  <li>Choose a portrait preview to open its player, or watch directly on YouTube. Use Watch Duris near the top of the page to jump to the videos.</li>
</ul>
```

## Verification

The page tests cover command search and reset, section navigation/focus, and
reduced-motion behavior. Mobile-navigation coverage checks the uppercase label,
placement before Guide, current-page state, and internal navigation. Browser
checks should cover anonymous desktop Wiki and mobile More entry, chapter jumps,
command search, preview loading, video selection/replacement/closing, direct
YouTube links, narrow layouts, zoom, keyboard focus, and the
Guide/Play destinations. Use the frontend checks from [Development](development.md).
These checks do not establish live deployment or exercise in-game commands.
