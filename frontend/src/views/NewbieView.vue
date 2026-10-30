<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useHead } from '@unhead/vue'
import { ArrowDown, ArrowUpRight, Compass, Film, Play, Search, X } from '@lucide/vue'
import {
  BrandActionLink,
  BrandTextLink,
  DisplayHeading,
  IndexLabel,
  SectionRule,
} from '@/components/brand'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSiteConfig } from '@/composables/useSiteConfig'
import firstSteps from '@/assets/newbie/first-steps.webp'
import camp from '@/assets/newbie/camp.webp'

const { siteTitle } = useSiteConfig()
useHead(() => ({
  title: siteTitle.value ? `NEWBIE | ${siteTitle.value}` : 'NEWBIE | First-session field guide',
  meta: [
    {
      name: 'description',
      content:
        'Your first adventure in Duris: create a character, learn the commands, choose your fights, find a group, and leave the world safely.',
    },
  ],
}))

const chapters = [
  { id: 'begin', label: 'Begin' },
  { id: 'explore', label: 'Explore' },
  { id: 'fight', label: 'Fight' },
  { id: 'recover', label: 'Recover' },
  { id: 'company', label: 'Find company' },
  { id: 'leave', label: 'Leave safely' },
]

// Titles and publisher verified through YouTube's oEmbed metadata; see docs/newbie-guide.md.
const videos = [
  {
    id: 'B0z2x4ngaeo',
    label: 'First steps',
    title: 'New player creation',
    youtubeTitle: 'DurisMUD - New Player Creation - Text Game',
    description: 'Every adventure starts with a character. See how yours begins.',
  },
  {
    id: 'hrpmW41xkKo',
    label: 'High stakes',
    title: 'Player vs. player',
    youtubeTitle: 'DurisMUD - Player vs Player PKILL - Text Game',
    description: 'The world has teeth. Sometimes, they belong to another player.',
  },
  {
    id: 'BTr7aWM80ts',
    label: 'Into the unknown',
    title: 'Exploring a dragon lair',
    youtubeTitle: 'DurisMUD - Exploring into a Dragon Lair - Text Game',
    description: 'Beyond the familiar rooms, something much bigger is waiting.',
  },
]
const activeVideo = ref<string | null>(null)

async function openVideo(id: string) {
  activeVideo.value = id
  await nextTick()
  document.getElementById(`video-player-${id}`)?.focus()
}

async function closeVideo(id: string) {
  activeVideo.value = null
  await nextTick()
  document.getElementById(`video-play-${id}`)?.focus()
}

const firstCommands = [
  { command: 'look', purpose: 'Read the room: its description, creatures, and objects.' },
  { command: 'exits', purpose: 'Check the visible ways out before choosing a direction.' },
  { command: 'score', purpose: 'Get to know your character and current condition.' },
  { command: 'inventory', purpose: 'See what you are carrying.' },
  { command: 'equipment', purpose: 'See what you are actually wearing and wielding.' },
]

// Gameplay evidence and update guidance: docs/newbie-guide.md.
const commands = [
  ...firstCommands.map((entry) => ({ ...entry, category: 'Explore' })),
  {
    command: 'n / e / s / w / u / d',
    purpose:
      'Move north, east, south, west, up, or down. Enter one direction at a time; ne, nw, se, sw also work where exits exist.',
    category: 'Explore',
  },
  {
    command: 'help <topic>',
    purpose: 'Read in-game help. Start with help newbie and help rules.',
    category: 'Learn',
  },
  {
    command: 'look <target>',
    purpose: 'Inspect a creature or object before interacting with it.',
    category: 'Explore',
  },
  {
    command: 'consider <mob>',
    purpose: 'Compare levels. This estimate does not account for gear or special attacks.',
    category: 'Fight',
  },
  {
    command: 'kill <mob>',
    purpose: 'Start combat with that target. Check the name and your exits first.',
    category: 'Fight',
  },
  {
    command: 'flee',
    purpose: 'Attempt to escape combat. It can fail and consumes movement.',
    category: 'Fight',
  },
  {
    command: 'wear <item>',
    purpose: 'Put on a wearable item from your inventory.',
    category: 'Equipment',
  },
  { command: 'wield <weapon>', purpose: 'Equip a weapon you are carrying.', category: 'Equipment' },
  {
    command: 'look in corpse',
    purpose: 'Inspect a corpse. Be sure you have selected the right one.',
    category: 'Equipment',
  },
  {
    command: 'get all corpse',
    purpose: 'Take the contents of the selected corpse, where permitted.',
    category: 'Equipment',
  },
  { command: 'rest', purpose: 'Rest between encounters somewhere safe.', category: 'Recover' },
  { command: 'stand', purpose: 'Get back on your feet before moving on.', category: 'Recover' },
  {
    command: 'eat <food> / drink <container>',
    purpose: 'Eat or drink from your supplies. Enter these as separate commands.',
    category: 'Recover',
  },
  {
    command: 'list',
    purpose: 'See the goods or services offered in a shop.',
    category: 'Equipment',
  },
  {
    command: 'practice',
    purpose: 'At a suitable teacher, list available skills and spells and their costs.',
    category: 'Learn',
  },
  {
    command: "memorize '<spell>' / pray '<spell>'",
    purpose:
      'Prepare a spell while resting, using the command and spellbook requirements for your class. These are alternatives.',
    category: 'Learn',
  },
  {
    command: 'cast "<spell>" <target>',
    purpose: 'Cast a prepared spell. Check its help for valid targets and your class requirements.',
    category: 'Learn',
  },
  { command: 'who', purpose: 'Look for players and people marked as guides.', category: 'Company' },
  {
    command: 'nchat <message>',
    purpose: 'Ask the newbie channel for help. If disabled, toggle nchat switches it on.',
    category: 'Company',
  },
  {
    command: 'tell <player> <message>',
    purpose: 'Send a message to an available player.',
    category: 'Company',
  },
  {
    command: 'consent <leader>',
    purpose: 'Give a trusted player consent. Consent with no name revokes it.',
    category: 'Company',
  },
  {
    command: 'follow <leader>',
    purpose: 'Follow a nearby leader. Ask them to add you to the group too.',
    category: 'Company',
  },
  { command: 'group', purpose: 'Check your group and its condition.', category: 'Company' },
  { command: 'gsay <message>', purpose: 'Speak to your group.', category: 'Company' },
  {
    command: 'assist <ally>',
    purpose: 'Join the fight against the opponent your ally is fighting.',
    category: 'Fight',
  },
  {
    command: 'recall',
    purpose: 'Read recent private-message history. This command does not teleport you.',
    category: 'Company',
  },
  {
    command: 'save',
    purpose: 'Request a character save. This does not log you out.',
    category: 'Leave',
  },
  {
    command: 'rent',
    purpose: 'At an eligible inn, store your equipment and leave the game. Read any refusal.',
    category: 'Leave',
  },
  {
    command: 'camp',
    purpose: 'Begin camping where allowed; wait until it finishes. Quit uses this same routine.',
    category: 'Leave',
  },
]

const search = ref('')
const filteredCommands = computed(() => {
  const query = search.value.trim().toLowerCase()
  return commands.filter((entry) =>
    `${entry.command} ${entry.purpose} ${entry.category}`.toLowerCase().includes(query),
  )
})

function jumpTo(id: string) {
  const target = document.getElementById(id)
  if (!target) return
  target.focus({ preventScroll: true })
  target.scrollIntoView({
    block: 'start',
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })
}

function clearSearch() {
  search.value = ''
  document.getElementById('command-search')?.focus()
}
</script>

<template>
  <article class="newbie-guide">
    <header class="newbie-hero course-gutter">
      <div class="hero-copy">
        <IndexLabel
          as="p"
          class="flex items-center gap-3"
          ><Compass
            class="size-4"
            aria-hidden="true"
          />
          NEWBIE / A first-session field guide</IndexLabel
        >
        <DisplayHeading
          size="none"
          class="hero-title"
          >Every legend<br />starts <em>somewhere.</em></DisplayHeading
        >
        <p class="hero-intro">A world made of words.<br />An adventure that is entirely yours.</p>
        <p class="max-w-prose leading-relaxed text-bone-muted">
          Duris is a multiplayer fantasy world you explore by typing commands. Learn to read a room,
          survive a fight, and find your people. You do not need to know everything to take the
          first step.
        </p>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-4">
          <a
            href="#begin"
            class="brand-action"
            @click.prevent="jumpTo('begin')"
            ><span>Start the crash course</span><ArrowDown aria-hidden="true"
          /></a>
          <BrandTextLink to="/play">Ready? Play now</BrandTextLink>
        </div>
        <a
          href="#watch"
          class="text-link inline-flex items-center gap-2"
          @click.prevent="jumpTo('watch')"
          ><Play class="size-3" aria-hidden="true" /> Watch Duris in action</a
        >
        <p class="index-label hero-footnote">Six short lessons. A whole world ahead.</p>
      </div>
      <figure class="hero-art">
        <img
          :src="firstSteps"
          alt=""
          width="1672"
          height="941"
          fetchpriority="high"
          class="hero-image"
        />
        <figcaption>
          <span class="index-label">At the threshold</span
          ><span>Original fantasy illustration</span>
        </figcaption>
      </figure>
    </header>

    <nav
      aria-label="Crash course chapters"
      class="chapter-nav course-gutter"
    >
      <a
        v-for="(chapter, index) in chapters"
        :key="chapter.id"
        :href="`#${chapter.id}`"
        @click.prevent="jumpTo(chapter.id)"
      >
        <span class="font-label text-xs text-label">0{{ index + 1 }}</span
        >{{ chapter.label }}
      </a>
      <a
        href="#watch"
        @click.prevent="jumpTo('watch')"
        ><Play class="size-3 text-vermilion" aria-hidden="true" /> Watch Duris</a
      >
      <a
        href="#commands"
        class="command-jump"
        @click.prevent="jumpTo('commands')"
        >Command reference
        <ArrowDown
          class="size-3"
          aria-hidden="true"
      /></a>
    </nav>

    <section
      id="watch"
      tabindex="-1"
      aria-labelledby="watch-heading"
      class="watch-section course-gutter"
    >
      <div class="watch-heading">
        <div>
          <IndexLabel as="p" class="flex items-center gap-3">
            <Film class="size-4" aria-hidden="true" /> Field footage / Three short adventures
          </IndexLabel>
          <DisplayHeading id="watch-heading" :level="2">
            A world of words.<br /><em>See it in action.</em>
          </DisplayHeading>
        </div>
        <div class="watch-intro">
          <p>Create a character. Face a rival. Venture into a dragon’s lair.</p>
          <p>Three glimpses of Duris, from Luminari MUD. Pick a short and step inside.</p>
        </div>
      </div>

      <div class="shorts-grid">
        <article v-for="(video, index) in videos" :key="video.id" class="short-card">
          <div class="short-media">
            <iframe
              v-if="activeVideo === video.id"
              :id="`video-player-${video.id}`"
              :src="`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`"
              :title="video.youtubeTitle"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowfullscreen
              referrerpolicy="strict-origin-when-cross-origin"
              tabindex="0"
            ></iframe>
            <template v-else>
              <img
                :src="`https://i.ytimg.com/vi/${video.id}/maxresdefault.jpg`"
                alt=""
                width="1280"
                height="720"
                loading="lazy"
                decoding="async"
                class="short-poster"
              />
              <div class="short-scrim" aria-hidden="true"></div>
              <span class="short-number" aria-hidden="true">0{{ index + 1 }}</span>
              <Button
                :id="`video-play-${video.id}`"
                type="button"
                variant="brand"
                size="lg"
                class="short-play"
                :aria-label="`Play ${video.title}`"
                @click="openVideo(video.id)"
              >
                <Play aria-hidden="true" /> Play short
              </Button>
              <span class="short-format index-label" aria-hidden="true">Duris / YouTube Shorts</span>
            </template>
          </div>
          <div class="short-caption">
            <IndexLabel as="p">0{{ index + 1 }} / {{ video.label }}</IndexLabel>
            <h3>{{ video.title }}</h3>
            <p class="short-description">{{ video.description }}</p>
            <div class="short-actions">
              <a
                :href="`https://www.youtube.com/shorts/${video.id}`"
                target="_blank"
                rel="noopener noreferrer"
                class="text-link"
                :aria-label="`Watch ${video.title} on YouTube (opens in a new tab)`"
              >
                Watch on YouTube <ArrowUpRight class="inline size-3" aria-hidden="true" />
              </a>
              <Button
                v-if="activeVideo === video.id"
                type="button"
                variant="ghost"
                size="sm"
                :aria-label="`Close video: ${video.title}`"
                @click="closeVideo(video.id)"
              >
                <X aria-hidden="true" /> Close player
              </Button>
            </div>
          </div>
        </article>
      </div>
      <p class="watch-footnote">
        Players load when you press play. Playback is provided by YouTube; you can also open each
        short there.
      </p>
    </section>

    <SectionRule />

    <div class="course-gutter course-body">
      <section
        id="begin"
        tabindex="-1"
        aria-labelledby="begin-heading"
        class="lesson"
      >
        <div class="lesson-heading">
          <IndexLabel as="p">01 / Begin</IndexLabel
          ><DisplayHeading
            id="begin-heading"
            :level="2"
            >Make a character.<br /><em>Find your feet.</em></DisplayHeading
          >
        </div>
        <div class="lesson-body">
          <p class="lesson-lead">You are a person in a place, not a cursor on a map.</p>
          <p>
            Rooms connect through exits. A <strong>mob</strong> is a computer-controlled creature;
            other characters may be real players. Your health keeps you alive, and your movement
            points help you travel and escape.
          </p>
          <ol class="starting-steps">
            <li>
              <span class="step-number">01</span>
              <div>
                <h3>Choose your way in</h3>
                <p>
                  <RouterLink
                    to="/play"
                    class="text-link"
                    >Play in your browser</RouterLink
                  >
                  and follow the account and character prompts. Prefer a desktop client? The
                  <RouterLink
                    to="/mudlet-gui"
                    class="text-link"
                    >Mudlet GUI guide</RouterLink
                  >
                  walks you through setup.
                </p>
              </div>
            </li>
            <li>
              <span class="step-number">02</span>
              <div>
                <h3>Say you are new</h3>
                <p>
                  Answer yes when character creation asks if you are new. Choose from the races,
                  classes, and hometowns it offers. The good side is recommended by the in-game
                  newbie help; choose normal play if offered a hardcore choice.
                </p>
              </div>
            </li>
            <li>
              <span class="step-number">03</span>
              <div>
                <h3>Take the introduction</h3>
                <p>
                  Look for a beginner introduction hometown in your available choices: Plane of Life
                  on the good side, or Plane of Chaos on the evil side. Availability depends on your
                  character. Read <code>help newbie</code> and <code>help rules</code> before
                  heading out.
                </p>
              </div>
            </li>
          </ol>
          <aside class="field-note">
            <span class="index-label">Know the stakes</span>
            <p>
              Duris is a PvP world. Other players can kill you and loot your equipment. Ask for help
              early, learn your surroundings, and treat unfamiliar territory with care.
            </p>
          </aside>
        </div>
      </section>

      <SectionRule />

      <section
        id="explore"
        tabindex="-1"
        aria-labelledby="explore-heading"
        class="lesson"
      >
        <div class="lesson-heading">
          <IndexLabel as="p">02 / Explore</IndexLabel
          ><DisplayHeading
            id="explore-heading"
            :level="2"
            >Read first.<br /><em>Move second.</em></DisplayHeading
          >
          <p>Type a command, press Enter, then read what happened.</p>
        </div>
        <div class="lesson-body">
          <div class="command-sheet">
            <div class="command-sheet-heading">
              <span class="index-label">Your first five commands</span
              ><span class="font-label text-xs text-muted-foreground">TYPE → READ → DECIDE</span>
            </div>
            <dl>
              <div
                v-for="entry in firstCommands"
                :key="entry.command"
                class="first-command"
              >
                <dt>
                  <span
                    aria-hidden="true"
                    class="text-vermilion"
                    >› </span
                  ><code>{{ entry.command }}</code>
                </dt>
                <dd>{{ entry.purpose }}</dd>
              </div>
            </dl>
          </div>
          <p>
            Move using <code>n</code>, <code>e</code>, <code>s</code>, <code>w</code>,
            <code>u</code>, or <code>d</code>. Diagonals <code>ne</code>, <code>nw</code>,
            <code>se</code>, and <code>sw</code> also work where there is an exit. Take one step at
            a time and read the new room.
          </p>
          <p>
            Carried gear is not necessarily equipped. Check <code>equipment</code>, use
            <code>wear &lt;item&gt;</code> for armor and <code>wield &lt;weapon&gt;</code> for a
            weapon. Replace anything in angle brackets with an actual name; do not type the
            brackets.
          </p>
          <aside class="field-note">
            <span class="index-label">Browser fieldcraft</span>
            <p>
              Long output may pause at a pager. Press Enter with an empty command field to continue,
              or type <code>q</code> to leave the pager. Up and Down browse your command history;
              Escape clears the field.
            </p>
          </aside>
          <BrandTextLink to="/surface-map">Get a feel for the wider world</BrandTextLink>
        </div>
      </section>

      <SectionRule />

      <section
        id="fight"
        tabindex="-1"
        aria-labelledby="fight-heading"
        class="lesson"
      >
        <div class="lesson-heading">
          <IndexLabel as="p">03 / Fight</IndexLabel
          ><DisplayHeading
            id="fight-heading"
            :level="2"
            >Courage is good.<br /><em>An exit is better.</em></DisplayHeading
          >
        </div>
        <div class="lesson-body">
          <p class="lesson-lead">Your first victory is choosing a fight you can leave.</p>
          <div class="combat-sequence">
            <div>
              <span class="index-label">Before</span>
              <h3>Size it up</h3>
              <p>
                <code>consider &lt;mob&gt;</code> compares levels. It cannot judge equipment, spell
                shields, or special attacks. Use <code>look &lt;mob&gt;</code> too, and check
                <code>exits</code>.
              </p>
            </div>
            <div>
              <span class="index-label">During</span>
              <h3>Watch your health</h3>
              <p>
                <code>kill &lt;mob&gt;</code> starts a fight. Combat continues between your
                commands. Start small and keep enough movement to escape; do not wait for your last
                hit point.
              </p>
            </div>
            <div>
              <span class="index-label">If it turns</span>
              <h3>Live to learn</h3>
              <p>
                <code>flee</code> attempts an escape and costs movement. It can fail, and enemies
                may pursue. Read the result, check your surroundings, and find a safer place.
              </p>
            </div>
          </div>
          <p>
            After a kill, <code>look in corpse</code> shows what is inside, and
            <code>get all corpse</code> takes what you can. Check that you are targeting the
            intended corpse when several share a room.
          </p>
        </div>
      </section>
    </div>

    <section
      id="recover"
      tabindex="-1"
      aria-labelledby="recover-heading"
      class="recovery-section course-gutter"
    >
      <div class="recovery-top">
        <div>
          <IndexLabel as="p">04 / Recover</IndexLabel
          ><DisplayHeading
            id="recover-heading"
            :level="2"
            >A pause is part<br />of the <em>adventure.</em></DisplayHeading
          >
        </div>
        <p>Rest. Refill. Learn something.<br />Then choose your next encounter.</p>
      </div>
      <div class="recovery-grid">
        <div>
          <h3>Look after the basics</h3>
          <p>
            Find a safe spot and <code>rest</code> between fights. Use <code>stand</code> when you
            are ready to move. Keep food and a drink container available:
            <code>eat &lt;food&gt;</code> and <code>drink &lt;container&gt;</code>. In a shop,
            <code>list</code> shows what is offered.
          </p>
        </div>
        <div>
          <h3>Learn your class</h3>
          <p>
            At a suitable teacher, <code>practice</code> lists available skills and spells with
            their costs. Read your class help before spending. Skills and spell preparation differ
            between classes; there is no single casting routine for everyone.
          </p>
        </div>
        <div>
          <h3>Prepare your magic</h3>
          <p>
            For spellbook casters, learning and preparing are separate steps.
            <code>help scribe</code> explains books and quills; <code>help memorize</code> explains
            preparation while resting. Use <code>memorize</code> or <code>pray</code> as appropriate
            for your class. Once prepared, <code>cast "&lt;spell&gt;" &lt;target&gt;</code> casts a spell;
            check its help for valid targets.
          </p>
        </div>
      </div>
      <div class="death-note">
        <span
          class="font-display text-4xl"
          aria-hidden="true"
          >↳</span
        >
        <div>
          <h3>If you die, take a breath.</h3>
          <p>
            Read the death and return messages. Your equipment may be in a corpse where you fell;
            ask for help before rushing back. Early death has an experience-loss grace period, but
            that does not make your gear safe. Watch for the level-up warning when that protection
            ends. Hardcore characters have separate permanent-death rules.
          </p>
        </div>
      </div>
    </section>

    <div class="course-gutter course-body">
      <section
        id="company"
        tabindex="-1"
        aria-labelledby="company-heading"
        class="lesson"
      >
        <div class="lesson-heading">
          <IndexLabel as="p">05 / Find company</IndexLabel
          ><DisplayHeading
            id="company-heading"
            :level="2"
            >The best resource<br />is <em>another player.</em></DisplayHeading
          >
        </div>
        <div class="lesson-body">
          <p>
            Try <code>nchat I'm new. Could someone help me find a trainer?</code> If the game says
            the channel is off, use <code>toggle nchat</code>. <code>who</code> can help you find a
            guide; <code>tell &lt;player&gt; &lt;message&gt;</code> starts a direct conversation.
            Give people time to respond.
          </p>
          <h3>Join a group, one step at a time</h3>
          <ol class="group-steps">
            <li>Agree on a leader and meet up.</li>
            <li>
              Type <code>consent &lt;leader&gt;</code>, then <code>follow &lt;leader&gt;</code>.
            </li>
            <li>
              The leader adds you with <code>group &lt;your-name&gt;</code>. Use
              <code>group</code> to check membership and condition.
            </li>
            <li>
              Talk with <code>gsay &lt;message&gt;</code>. When asked to join a fight,
              <code>assist &lt;ally&gt;</code> targets the opponent they are fighting.
            </li>
          </ol>
          <p>
            Give consent only to someone you trust. Entering <code>consent</code> without a name
            revokes it.
          </p>
          <aside class="field-note">
            <span class="index-label">A word that trips people up</span>
            <p>
              <code>recall</code> displays recent private-message history. It does not teleport you
              home. For travel or rescue, ask your group what is actually available to your
              character.
            </p>
          </aside>
        </div>
      </section>

      <SectionRule />

      <section
        id="leave"
        tabindex="-1"
        aria-labelledby="leave-heading"
        class="leave-section"
      >
        <figure class="camp-art">
          <img
            :src="camp"
            alt=""
            width="1536"
            height="1024"
            loading="lazy"
            decoding="async"
          />
          <figcaption class="index-label">
            A moment of respite · Original fantasy illustration
          </figcaption>
        </figure>
        <div class="lesson-body">
          <IndexLabel as="p">06 / Leave safely</IndexLabel
          ><DisplayHeading
            id="leave-heading"
            :level="2"
            >End the session.<br /><em>Keep the story.</em></DisplayHeading
          >
          <p>
            Head to an inn and type <code>rent</code> to store your equipment and leave the game.
            Combat, recent PvP, and other restrictions can prevent renting. Read the response and
            wait for the game to confirm that you have left.
          </p>
          <p>
            Away from town, <code>camp</code> starts a timed departure where conditions allow it.
            Wait for camping to finish. In the current game, <code>quit</code> uses the same camping
            routine; it is not an instant exit.
          </p>
          <aside class="field-note">
            <span class="index-label">Before closing the tab</span>
            <p>
              <code>save</code> does not log you out. Disconnecting can leave your character in the
              world and exposed. Finish renting or camping first.
            </p>
          </aside>
        </div>
      </section>

      <SectionRule />

      <section
        id="commands"
        tabindex="-1"
        aria-labelledby="commands-heading"
        class="reference-section"
      >
        <div class="reference-heading">
          <div>
            <IndexLabel as="p">Keep this within reach</IndexLabel
            ><DisplayHeading
              id="commands-heading"
              :level="2"
              >A little less lost.<br /><em>A command away.</em></DisplayHeading
            >
          </div>
          <p>
            A pocket reference for your first adventures. Replace
            <code>&lt;placeholders&gt;</code> with real names. A slash separates alternatives, not a
            command to paste.
          </p>
        </div>
        <div class="command-search">
          <div class="flex flex-1 flex-col gap-2">
            <Label for="command-search">Find a command</Label>
            <div class="relative">
              <Search
                class="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground"
                aria-hidden="true"
              /><Input
                id="command-search"
                v-model="search"
                type="search"
                placeholder="Try “fight”, “group”, or “equipment”…"
                class="pl-9"
                aria-describedby="command-count"
              />
            </div>
          </div>
          <Button
            v-if="search"
            type="button"
            variant="outline"
            @click="clearSearch"
            >Clear search</Button
          >
          <p
            id="command-count"
            role="status"
            class="font-label text-xs text-muted-foreground"
          >
            {{ filteredCommands.length }}
            {{ filteredCommands.length === 1 ? 'command' : 'commands' }}
          </p>
        </div>
        <dl
          v-if="filteredCommands.length"
          class="reference-grid"
        >
          <div
            v-for="entry in filteredCommands"
            :key="entry.command"
            class="reference-entry"
          >
            <dt>
              <span class="index-label">{{ entry.category }}</span
              ><code>{{ entry.command }}</code>
            </dt>
            <dd>{{ entry.purpose }}</dd>
          </div>
        </dl>
        <div
          v-else
          class="empty-search"
        >
          <p>
            No commands match “{{ search }}”. Try a shorter word, or clear the search to see every
            command.
          </p>
        </div>
        <p class="mt-6 text-sm text-muted-foreground">
          Need the full explanation? Search the
          <RouterLink
            to="/guide"
            class="text-link"
            >Guide help library</RouterLink
          >, or use <code>help &lt;topic&gt;</code> in the game.
        </p>
      </section>

      <footer class="course-footer">
        <div>
          <IndexLabel as="p">You know enough to begin</IndexLabel
          ><DisplayHeading :level="2">The next command<br />is <em>yours.</em></DisplayHeading>
        </div>
        <div class="flex flex-col items-start gap-5">
          <BrandActionLink to="/play">Enter the world</BrandActionLink
          ><BrandTextLink to="/guide">Keep exploring the Guide</BrandTextLink>
        </div>
      </footer>
      <p class="source-note">
        Written for the current Duris source; server settings and in-game messages take precedence.
        Topic inspiration:
        <a
          href="https://duris.fandom.com/wiki/Beginners_Guide_to_Duris"
          class="text-link"
          >the community’s Beginners Guide
          <ArrowUpRight
            class="inline size-3"
            aria-hidden="true" /></a
        >. Gameplay verification and artwork provenance are maintained with this page’s source.
      </p>
    </div>
  </article>
</template>

<style scoped>
.newbie-guide {
  --course-gutter: clamp(1.25rem, 5vw, 5.5rem);
}
.course-gutter {
  padding-inline: var(--course-gutter);
}
.newbie-hero {
  display: grid;
  grid-template-columns: 1fr 1.1fr;
  gap: clamp(2rem, 4vw, 4.5rem);
  max-width: 105rem;
  margin-inline: auto;
  padding-top: clamp(2rem, 4vw, 4rem);
  padding-bottom: 3rem;
  align-items: center;
}
.hero-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.75rem;
  padding-block: 1rem;
}
.hero-title {
  font-size: clamp(3.75rem, 5.8vw, 6.5rem);
  line-height: 0.92;
  letter-spacing: -0.035em;
}
.hero-intro {
  font-size: 1.25rem;
  line-height: 1.5;
}
.hero-footnote {
  margin-top: 0.5rem;
}
.hero-art {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.hero-image {
  width: 100%;
  height: 100%;
  min-height: 29rem;
  max-height: 43rem;
  object-fit: cover;
  object-position: 66% center;
}
.hero-art figcaption {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.75rem;
  font-size: 0.7rem;
  color: var(--color-bone-muted);
}
.chapter-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 1.6rem;
  padding-block: 0.75rem;
  border-block: 1px solid var(--color-rule);
  background: var(--color-ink-raised);
}
.chapter-nav a {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding-block: 0.65rem;
  font-size: 0.8rem;
  text-decoration: underline;
  text-underline-offset: 0.25rem;
  text-decoration-color: transparent;
}
.chapter-nav a:hover {
  color: var(--color-vermilion-light);
  text-decoration-color: currentColor;
}
.chapter-nav .command-jump {
  margin-left: auto;
  color: var(--color-bone);
}
.course-body {
  max-width: 90rem;
  margin-inline: auto;
}
.watch-section {
  max-width: 90rem;
  margin-inline: auto;
  padding-block: clamp(3rem, 6vw, 5rem);
}
.watch-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 2.5rem;
}
.watch-heading h2 {
  margin-top: 1.5rem;
  font-size: clamp(2.5rem, 3.7vw, 3.75rem);
  line-height: 1.03;
}
.watch-intro {
  max-width: 35ch;
  color: var(--color-bone-muted);
  line-height: 1.8;
}
.watch-intro p + p {
  margin-top: 0.75rem;
}
.shorts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(1rem, 2.5vw, 2rem);
  max-width: 64rem;
  margin-inline: auto;
}
.short-card {
  min-width: 0;
  border-top: 2px solid var(--color-vermilion);
}
.short-media {
  position: relative;
  aspect-ratio: 9 / 16;
  background: var(--color-ink-sunken);
  isolation: isolate;
}
.short-poster,
.short-media iframe,
.short-scrim {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.short-poster {
  object-fit: cover;
}
.short-scrim {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--color-ink) 65%, transparent),
    transparent 35%,
    color-mix(in srgb, var(--color-ink) 30%, transparent) 65%,
    var(--color-ink-sunken)
  );
  pointer-events: none;
}
.short-number {
  position: absolute;
  top: 1rem;
  left: 1.25rem;
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 5vw, 4rem);
  line-height: 1;
  color: var(--color-bone);
}
.short-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
.short-format {
  position: absolute;
  bottom: 1.5rem;
  inset-inline: 1rem;
  text-align: center;
  color: var(--color-bone);
  font-size: 0.6rem;
}
.short-caption {
  padding-block: 1.5rem 0.5rem;
}
.newbie-guide .short-caption h3 {
  margin-block: 0.75rem;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: clamp(1.65rem, 2.5vw, 2rem);
  line-height: 1.1;
}
.short-description,
.watch-footnote {
  color: var(--color-bone-muted);
  font-size: 0.875rem;
  line-height: 1.8;
}
.short-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.75rem;
  margin-top: 1rem;
  font-size: 0.75rem;
}
.watch-footnote {
  border-top: 1px solid var(--color-rule);
  padding-top: 1.25rem;
  margin-top: 2rem;
  font-size: 0.75rem;
}
.lesson {
  display: grid;
  grid-template-columns: 1fr 1.65fr;
  gap: clamp(2rem, 5vw, 6rem);
  padding-block: clamp(3rem, 6vw, 6rem);
}
.lesson-heading,
.lesson-body {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  min-width: 0;
}
.lesson-heading h2,
.recovery-top h2,
.leave-section h2,
.reference-heading h2,
.course-footer h2 {
  font-size: clamp(2.5rem, 3.7vw, 3.75rem);
  line-height: 1.03;
}
.lesson-heading > p:not(.index-label) {
  color: var(--color-bone-muted);
  line-height: 1.7;
  max-width: 28ch;
}
.lesson-body > p,
.lesson-body li p,
.lesson-body aside p,
.group-steps {
  color: var(--color-bone-muted);
  line-height: 1.8;
}
.lesson-body .lesson-lead {
  font-family: var(--font-display);
  font-size: 1.8rem;
  color: var(--color-bone);
  line-height: 1.25;
}
.newbie-guide h3 {
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.5;
  margin-bottom: 0.5rem;
}
.newbie-guide code {
  font-size: 0.86em;
  color: var(--color-bone);
  overflow-wrap: anywhere;
}
.newbie-guide p code,
.group-steps code {
  background: var(--color-ink-high);
  padding: 0.12em 0.35em;
  box-decoration-break: clone;
}
.newbie-guide section[id] {
  scroll-margin-block: 1.5rem 6rem;
}
.starting-steps {
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}
.starting-steps li {
  display: grid;
  grid-template-columns: 2rem 1fr;
  gap: 1rem;
}
.step-number {
  padding-top: 0.15rem;
  font-family: var(--font-label);
  font-size: 0.85rem;
  color: var(--color-vermilion-light);
}
.field-note {
  border-left: 2px solid var(--color-vermilion);
  padding: 1.25rem 1.5rem;
  background: var(--color-ink-raised);
  width: 100%;
}
.field-note .index-label {
  display: block;
  margin-bottom: 0.6rem;
}
.command-sheet {
  width: 100%;
  background: var(--color-ink-sunken);
  border: 1px solid var(--color-rule);
}
.command-sheet-heading {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid var(--color-rule);
}
.first-command {
  display: grid;
  grid-template-columns: 8.5rem 1fr;
  gap: 1rem;
  padding: 1rem 1.5rem;
}
.first-command + .first-command {
  border-top: 1px solid color-mix(in srgb, var(--color-rule) 35%, transparent);
}
.first-command dt {
  font-family: var(--font-label);
}
.first-command dd {
  color: var(--color-bone-muted);
  font-size: 0.875rem;
  line-height: 1.65;
}
.combat-sequence {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
}
.combat-sequence .index-label {
  display: block;
  margin-bottom: 0.75rem;
}
.combat-sequence p {
  color: var(--color-bone-muted);
  line-height: 1.8;
  font-size: 0.95rem;
}
.recovery-section {
  padding-block: clamp(3rem, 6vw, 5rem);
  background: var(--color-bone);
  color: var(--color-paper-ink);
}
.recovery-top,
.recovery-grid,
.death-note {
  max-width: 79rem;
  margin-inline: auto;
}
.recovery-top {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
}
.recovery-top h2 {
  margin-top: 1.5rem;
  color: var(--color-paper-ink);
}
.recovery-section :deep(h2 em) {
  color: var(--color-vermilion-paper);
}
.recovery-section .index-label {
  color: var(--color-vermilion-paper);
}
.recovery-top > p {
  line-height: 1.8;
}
.recovery-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2.5rem;
  padding-block: 2.5rem;
  margin-top: 2.5rem;
  border-top: 1px solid var(--color-rule-paper);
}
.recovery-grid p,
.death-note p {
  line-height: 1.8;
}
.recovery-section p code {
  color: var(--color-paper-ink);
  background: color-mix(in srgb, var(--color-paper-ink) 8%, transparent);
}
.death-note {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  border-top: 1px solid var(--color-rule-paper);
  padding-top: 2rem;
}
.group-steps {
  list-style: decimal;
  padding-left: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.group-steps li::marker {
  color: var(--color-label);
  font-family: var(--font-label);
}
.leave-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: clamp(2rem, 5vw, 5rem);
  align-items: center;
  padding-block: clamp(3rem, 6vw, 6rem);
}
.camp-art {
  min-width: 0;
}
.camp-art img {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
}
.camp-art figcaption {
  margin-top: 1rem;
  font-size: 0.65rem;
}
.reference-section {
  padding-block: clamp(3rem, 6vw, 6rem);
}
.reference-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 2rem;
  align-items: flex-end;
  justify-content: space-between;
}
.reference-heading h2 {
  margin-top: 1.5rem;
}
.reference-heading > p {
  color: var(--color-bone-muted);
  max-width: 42ch;
  line-height: 1.8;
}
.command-search {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
  padding-block: 2.5rem 1.5rem;
}
.command-search > div {
  min-width: min(100%, 17rem);
  max-width: 32rem;
}
.command-search > p {
  padding-block: 0.65rem;
}
.reference-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--color-rule);
}
.reference-entry {
  min-width: 0;
  padding: 1.5rem 1.75rem 1.5rem 0;
  border-bottom: 1px solid var(--color-rule);
}
.reference-entry dt {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.reference-entry .index-label {
  font-size: 0.6rem;
}
.reference-entry dt code {
  font-size: 0.9rem;
}
.reference-entry dd {
  color: var(--color-bone-muted);
  line-height: 1.65;
  font-size: 0.875rem;
}
.empty-search {
  border-block: 1px solid var(--color-rule);
  padding-block: 2rem;
  color: var(--color-bone-muted);
}
.course-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  padding-block: 3rem;
  border-block: 1px solid var(--color-rule);
}
.course-footer h2 {
  margin-top: 1.5rem;
}
.source-note {
  padding-block: 2rem;
  font-size: 0.75rem;
  color: var(--color-bone-muted);
  line-height: 1.8;
  max-width: 100ch;
}
@media (max-width: 1100px) {
  .newbie-hero {
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }
  .hero-title {
    font-size: clamp(3.5rem, 6.6vw, 5.5rem);
  }
  .chapter-nav .command-jump {
    margin-left: 0;
  }
  .lesson {
    grid-template-columns: 1fr 1.7fr;
    gap: 2.5rem;
  }
  .combat-sequence {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .reference-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .shorts-grid {
    grid-template-columns: 1fr;
    max-width: 20rem;
    gap: 2.5rem;
  }
  .newbie-hero {
    grid-template-columns: 1fr;
    padding-top: 1.5rem;
  }
  .hero-copy {
    gap: 1.5rem;
  }
  .hero-title {
    font-size: clamp(3.5rem, 11.5vw, 5.5rem);
  }
  .hero-intro {
    font-size: 1.125rem;
  }
  .hero-image {
    height: auto;
    min-height: 0;
    max-height: none;
    aspect-ratio: 16 / 11;
    object-position: center;
  }
  .chapter-nav {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 1rem;
  }
  .chapter-nav .command-jump {
    grid-column: 1 / -1;
    padding-top: 0.9rem;
    margin-top: 0.4rem;
    border-top: 1px solid var(--color-rule);
  }
  .lesson,
  .leave-section,
  .recovery-grid {
    grid-template-columns: 1fr;
  }
  .lesson {
    gap: 2rem;
  }
  .lesson-heading h2 br {
    display: none;
  }
  .first-command {
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
  }
  .recovery-grid {
    gap: 2rem;
  }
  .camp-art img {
    aspect-ratio: 3 / 2;
  }
  .leave-section .lesson-body {
    order: -1;
  }
}
@media (max-width: 480px) {
  .reference-grid {
    grid-template-columns: 1fr;
  }
  .reference-entry {
    padding-right: 0;
  }
  .death-note > span {
    display: none;
  }
  .starting-steps li {
    grid-template-columns: 1.5rem 1fr;
    gap: 0.75rem;
  }
  .hero-art figcaption {
    font-size: 0.65rem;
  }
}
</style>
