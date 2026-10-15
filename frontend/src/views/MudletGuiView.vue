<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { ArrowUpRight } from '@lucide/vue'
import { BrandTextLink, DisplayHeading, IndexLabel, SectionRule } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { useSiteConfig } from '@/composables/useSiteConfig'
import { mudletGuiLinks } from '@/config/links'
import overview from '@/assets/mudlet-gui/overview.png'
import combatGroup from '@/assets/mudlet-gui/combat-group.png'
import chatEquipment from '@/assets/mudlet-gui/chat-equipment.png'
import wilderness from '@/assets/mudlet-gui/wilderness.png'

const { siteTitle, mudHost, mudPort, isAvailable, isLoading, error } = useSiteConfig()

useHead(() => ({
  title:
    isAvailable.value && siteTitle.value ? `Mudlet GUI | ${siteTitle.value}` : 'Site unavailable',
  meta: [
    {
      name: 'description',
      content:
        isAvailable.value && siteTitle.value
          ? `Explore the ${siteTitle.value} Mudlet GUI: maps, group status, organized chat, and character details around your game console. See screenshots and install the client package.`
          : 'Desktop Mudlet package screenshots and installation instructions.',
    },
  ],
}))

// Native captures of the public v1.3.0 package; provenance lives beside the assets.
const demonstrationCaption =
  'Arjinius Client 1.3.0 · Mudlet 5.0.1 on Linux. Offline demonstration with invented characters, dialogue, combat, equipment, and geography.'

interface IllustratedBenefit {
  id: string
  title: string
  body: string
  image: string
  alt: string
  caption: string
  fullSizeLabel: string
}

const illustratedBenefits: IllustratedBenefit[] = [
  {
    id: 'group',
    title: 'Keep an eye on the group',
    body: 'See group health and movement, spot a hurt companion, and notice who is away from your room. Target, tank, and affect displays keep combat details nearby.',
    image: combatGroup,
    alt: 'A demonstration fight with Hale highlighted in the group, a bronze guardian at 40 percent health, poison in the debuff panel, and a damage total of 148.',
    caption:
      'Group condition, tank and target information, affects, and damage during an illustrative fight.',
    fullSizeLabel: 'Open combat and group screenshot at full size',
  },
  {
    id: 'conversations',
    title: 'Give each conversation its place',
    body: 'Follow guild and group chat in dedicated tabs, keep public channels together, or open a separate window for a tell. Timestamps help you follow the exchange. Tell history and contacts last for the current session.',
    image: chatEquipment,
    alt: 'The equipment tab lists five items while guild chat and a private conversation with the fictional character Kestrel appear beside the game console.',
    caption: 'Equipment, guild chat, and a separate tell window stay near the main console.',
    fullSizeLabel: 'Open chat and equipment screenshot at full size',
  },
  {
    id: 'details',
    title: 'Bring the details within reach',
    body: 'Check equipment, inventory, character information, and quest progress without losing the main game view. Dedicated tabs also provide who-list and ship-contact information.',
    image: wilderness,
    alt: 'A colored wilderness map with a position marker on the left and character stats with a two-of-five guardian quest on the right.',
    caption:
      'The wilderness map replaces the zone layout; STATS shows character and quest details.',
    fullSizeLabel: 'Open wilderness screenshot at full size',
  },
]
</script>

<template>
  <article class="mudlet-gui mx-auto max-w-7xl space-y-12 py-6 sm:space-y-16 sm:py-10">
    <p v-if="isLoading" role="status" class="text-muted-foreground">Loading site information…</p>
    <p v-else-if="!isAvailable" role="alert" class="text-muted-foreground">
      {{ error || 'The website is temporarily unavailable. Please try again shortly.' }}
    </p>
    <template v-else>
      <header class="space-y-6">
        <IndexLabel as="p">Desktop play · Arjinius Client</IndexLabel>
        <DisplayHeading>Mudlet GUI</DisplayHeading>
        <p class="max-w-3xl font-display text-5xl font-normal leading-none sm:text-7xl">
          Keep the world <em class="text-vermilion">in view.</em>
        </p>
        <p class="max-w-prose text-lg leading-relaxed text-bone-muted">
          Explore {{ siteTitle }} with your map, group, and conversations beside the action.
          Arjinius Client gives Mudlet a dedicated {{ siteTitle }} interface, keeping the game
          text at the center and the details you need within reach.
        </p>
        <div class="space-y-3">
          <div class="flex flex-wrap items-center gap-4">
            <Button as-child variant="brand" size="lg">
              <a :href="mudletGuiLinks.releases">
                Download GUI package <ArrowUpRight aria-hidden="true" />
              </a>
            </Button>
            <a :href="mudletGuiLinks.mudlet" class="text-link">Get Mudlet</a>
          </div>
          <p class="text-sm text-muted-foreground">
            Choose <code>duris-client.mpackage</code> from the release assets. Install Mudlet separately.
          </p>
          <p class="max-w-prose text-sm text-muted-foreground">
            For desktop Mudlet 4.19.1 or newer. Requires a {{ siteTitle }} profile with GMCP enabled.
          </p>
        </div>
        <p class="text-bone-muted">
          Prefer to start here? <BrandTextLink to="/play">Play in your browser.</BrandTextLink>
        </p>
      </header>

      <figure class="space-y-4">
        <img
          :src="overview"
          alt="Arjinius Client showing a central game console, a zone map and room lists on the left, group and chat panels on the right, and vitals along the bottom."
          width="1920"
          height="1080"
          loading="eager"
          class="h-auto w-full border border-border"
        />
        <figcaption class="space-y-2 text-sm leading-relaxed text-muted-foreground">
          <p class="text-bone-muted">The game at the center, with maps, room details, group status, and chat around it.</p>
          <p>{{ demonstrationCaption }}</p>
          <a :href="overview" class="text-link inline-block">Open overview screenshot at full size</a>
        </figcaption>
      </figure>

      <SectionRule />

      <section aria-labelledby="benefits-heading" class="space-y-10 sm:space-y-14">
        <div class="space-y-3">
          <IndexLabel as="p">01 / Inside the interface</IndexLabel>
          <DisplayHeading id="benefits-heading" :level="2">More of the world, within reach.</DisplayHeading>
        </div>
        <div class="grid gap-8 md:grid-cols-2 md:gap-12">
          <div class="space-y-3">
            <DisplayHeading :level="3">Your adventure stays central</DisplayHeading>
            <p class="max-w-prose leading-relaxed text-bone-muted">
              Read the room, follow the fight, and enter your next command in the central console.
              Character details, maps, and conversations have their own space around it.
            </p>
          </div>
          <div class="space-y-3">
            <DisplayHeading :level="3">Find your bearings</DisplayHeading>
            <p class="max-w-prose leading-relaxed text-bone-muted">
              Follow your position through available zone layouts, then switch to the wilderness
              view outside. Zoom controls and visible exits help you understand the room around you.
            </p>
          </div>
        </div>

        <section v-for="benefit in illustratedBenefits" :key="benefit.id" :aria-labelledby="`${benefit.id}-heading`" class="space-y-6 border-t border-border pt-8">
          <div class="grid gap-4 md:grid-cols-2 md:gap-12">
            <DisplayHeading :id="`${benefit.id}-heading`" :level="3">{{ benefit.title }}</DisplayHeading>
            <p class="max-w-prose leading-relaxed text-bone-muted">{{ benefit.body }}</p>
          </div>
          <figure class="space-y-4">
            <img :src="benefit.image" :alt="benefit.alt" width="1920" height="1080" loading="lazy" decoding="async" class="h-auto w-full border border-border" />
            <figcaption class="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p class="text-bone-muted">{{ benefit.caption }}</p>
              <p>{{ demonstrationCaption }}</p>
              <a :href="benefit.image" class="text-link inline-block">{{ benefit.fullSizeLabel }}</a>
            </figcaption>
          </figure>
        </section>

        <div class="grid gap-4 border-t border-border pt-8 md:grid-cols-2 md:gap-12">
          <DisplayHeading :level="3">Choose your own helpers</DisplayHeading>
          <p class="max-w-prose leading-relaxed text-bone-muted">
            Use numpad movement and utility commands, then enable individual automation helpers if
            you want them. Automatic behaviors start off; <code>ui help</code> and <code>auto</code>
            explain the available controls.
          </p>
        </div>
      </section>

      <SectionRule />

      <section aria-labelledby="installation-heading" class="space-y-8">
        <div class="space-y-3">
          <IndexLabel as="p">02 / Installation</IndexLabel>
          <DisplayHeading id="installation-heading" :level="2">Set up your next session.</DisplayHeading>
        </div>
        <ol class="max-w-3xl list-decimal space-y-8 pl-6 marker:text-vermilion">
          <li class="space-y-2 pl-2">
            <h3 class="font-medium">Install Mudlet.</h3>
            <p class="leading-relaxed text-bone-muted">
              Get the desktop application from the <a :href="mudletGuiLinks.mudlet" class="text-link">official Mudlet download page</a>.
              The package requires Mudlet 4.19.1 or newer.
            </p>
          </li>
          <li class="space-y-2 pl-2">
            <h3 class="font-medium">Open your {{ siteTitle }} profile.</h3>
            <p class="leading-relaxed text-bone-muted">Enable GMCP in the profile and in the game.</p>
            <p v-if="mudHost && mudPort" class="break-words text-sm text-muted-foreground">
              Host: <code>{{ mudHost }}</code> · Port: <code>{{ mudPort }}</code>
            </p>
          </li>
          <li class="space-y-2 pl-2">
            <h3 class="font-medium">Install the GUI package.</h3>
            <p class="leading-relaxed text-bone-muted">
              Open the <a :href="mudletGuiLinks.releases" class="text-link">GitHub releases page</a>
              and download <code>duris-client.mpackage</code> from the current release’s assets.
              In Mudlet, open Package Manager (<kbd>Alt+O</kbd>), choose <strong>Install New Package</strong>,
              and select the file. The package appears as <strong>Arjinius Client</strong>.
              See the <a :href="mudletGuiLinks.packageManager" class="text-link">Package Manager instructions</a>.
            </p>
          </li>
          <li class="space-y-2 pl-2">
            <h3 class="font-medium">Reconnect and enter the world.</h3>
            <p class="leading-relaxed text-bone-muted">
              Fresh character and room data populate the panels. Type <code>ui help</code> to explore the controls.
            </p>
          </li>
        </ol>
        <p class="max-w-prose leading-relaxed text-bone-muted">
          <strong class="font-medium text-foreground">Already installed?</strong> Download the current
          package from the release page, replace the installed copy through Package Manager, and
          reconnect. Read the <a :href="mudletGuiLinks.releaseNotes" class="text-link">release notes</a> for changes.
        </p>
      </section>

      <SectionRule />

      <section aria-labelledby="questions-heading" class="space-y-8">
        <div class="space-y-3">
          <IndexLabel as="p">03 / Practical questions</IndexLabel>
          <DisplayHeading id="questions-heading" :level="2">Before you enter the world.</DisplayHeading>
        </div>
        <div class="grid gap-x-12 gap-y-8 md:grid-cols-2">
          <div class="space-y-3">
            <h3 class="font-medium">Is this the browser client?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">This is a package for the desktop Mudlet application. You can also <BrandTextLink to="/play">play in your browser</BrandTextLink> from this website.</p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">Why are some panels empty?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">Enter the game with GMCP enabled, then try <code>ui debug</code> if character or room information is missing. Reconnecting requests fresh data. Some information, including equipment and tank condition, depends on recognized game text and prompt formats.</p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">What if the map is missing?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">Zone maps need access to the {{ siteTitle }} website’s map service. Try <code>mapper status</code>, then <code>mapper reload</code> followed by <code>look</code>. Wilderness maps use information supplied by the game.</p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">Does it play for me?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">The interface organizes game information around your commands. Optional automation helpers are individually enabled and start off. Type <code>auto</code> to review them before changing settings.</p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">Can I return to the standard console?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">Use <code>ui off</code> to restore Mudlet’s main console and command line. Use <code>ui on</code> to build the interface again.</p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">Where can I get help?</h3>
            <p class="max-w-prose leading-relaxed text-bone-muted">Read the <a :href="mudletGuiLinks.guide" class="text-link">client guide</a> and <a :href="mudletGuiLinks.releaseNotes" class="text-link">release notes</a>, or <a :href="mudletGuiLinks.issues" class="text-link">report a problem</a> in the client repository’s issue tracker.</p>
          </div>
        </div>
      </section>

      <SectionRule />

      <footer class="space-y-6">
        <DisplayHeading :level="2">Make room for the whole adventure.</DisplayHeading>
        <p class="max-w-prose leading-relaxed text-bone-muted">Bring maps, conversations, and character details into your next {{ siteTitle }} session. Install the GUI package in Mudlet and enter the world.</p>
        <Button as-child variant="brand" size="lg">
          <a :href="mudletGuiLinks.releases">Download GUI package <ArrowUpRight aria-hidden="true" /></a>
        </Button>
        <ul class="flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <li><a :href="mudletGuiLinks.releaseNotes" class="text-link">Release notes</a></li>
          <li><a :href="mudletGuiLinks.guide" class="text-link">Client guide</a></li>
          <li><a :href="mudletGuiLinks.issues" class="text-link">Report a problem</a></li>
        </ul>
        <p class="text-sm text-muted-foreground">Originally created by Arjinius / Arjin. Maintained by LuminariMUD.</p>
      </footer>
    </template>
  </article>
</template>

<style scoped>
.text-link {
  color: var(--color-vermilion);
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.text-link:hover {
  color: var(--color-vermilion-light);
}

code {
  overflow-wrap: anywhere;
}
</style>
