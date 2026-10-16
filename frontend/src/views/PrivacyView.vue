<script setup lang="ts">
import { useHead } from '@unhead/vue'
import { DisplayHeading, IndexLabel, SectionRule } from '@/components/brand'
import PrivacyControls from '@/components/privacy/PrivacyControls.vue'
import { privacyContact, PRIVACY_NOTICE_VERSION } from '@/config/privacyNotice'
import { useSiteConfig } from '@/composables/useSiteConfig'

const { siteTitle } = useSiteConfig()
useHead(() => ({
  title: siteTitle.value ? `Privacy & choices | ${siteTitle.value}` : 'Privacy & choices',
}))
</script>

<template>
  <article class="mx-auto max-w-3xl space-y-8 py-6 sm:py-10">
    <header class="space-y-4">
      <IndexLabel as="p">Privacy · {{ PRIVACY_NOTICE_VERSION }}</IndexLabel>
      <DisplayHeading>Privacy &amp; <em>choices</em></DisplayHeading>
      <p class="text-lg text-muted-foreground">Learn about website data and control optional visit statistics without signing in.</p>
      <p class="border-l-2 border-warning pl-4 text-muted-foreground">
        Draft privacy details: provider use, retention periods and request procedures are still being reviewed. Optional website analytics remain paused while these details and controls are prepared.
      </p>
    </header>
    <PrivacyControls />
    <section class="space-y-3" aria-labelledby="privacy-contact">
      <h2 id="privacy-contact" class="text-3xl">Contact about your data</h2>
      <p>Privacy contact: {{ privacyContact.name }}. Email <a :href="`mailto:${privacyContact.email}`" class="underline underline-offset-4">{{ privacyContact.email }}</a> to ask for a copy, correction, removal, or human review of an account decision.</p>
      <p class="text-muted-foreground">We may need to verify your identity and protect other people's information. A website request may also need separate action for the game or an external service. Please do not email passwords.</p>
    </section>
    <SectionRule />
    <section class="space-y-3" aria-labelledby="privacy-account-data">
      <h2 id="privacy-account-data" class="text-3xl">Accounts and community features</h2>
      <p>Account and character details support sign-in, permissions and game features. Profiles, forum posts, reactions, votes, subscriptions and notifications support the community. Images and donation details are handled when you use those features.</p>
      <p class="text-muted-foreground">Signing in uses session cookies. The browser game client may keep temporary sign-in information and client settings in your tab or browser. Signing out is separate from removing community content or account records.</p>
    </section>
    <section class="space-y-3" aria-labelledby="privacy-security">
      <h2 id="privacy-security" class="text-3xl">Security and staff records</h2>
      <p>Connection and security records can include account or character names, IP addresses and activity times. Staff actions, moderation, terminal output and incident records can contain additional account or content details.</p>
      <p class="text-muted-foreground">These security records are separate from optional visit statistics. Account-suspicion tools and any external analysis need a disclosed purpose and a way to ask for human review. Contact us about a decision you want reviewed.</p>
    </section>
    <section class="space-y-3" aria-labelledby="privacy-optional">
      <h2 id="privacy-optional" class="text-3xl">Optional visit statistics</h2>
      <p>The proposed feature counts page types and visits after permission, using a temporary random visit code. The stored statistics do not include account names, full page addresses, searches, IP addresses, device details or locations.</p>
      <p class="text-muted-foreground">The visit code stays only in page memory. Reloading, changing accounts, withdrawing or closing the page clears it. Your choice is checked with the server; a browser setting alone cannot authorize collection.</p>
      <p class="text-muted-foreground">A small browser safety setting keeps tracking off when a change cannot be confirmed. It remains until a new confirmed choice or you clear browser data. Your saved permission also has an expiry date; its proposed lifetime still needs approval.</p>
    </section>
    <SectionRule />
    <section class="space-y-3" aria-labelledby="privacy-providers">
      <h2 id="privacy-providers" class="text-3xl">External services and copies</h2>
      <p>Cloudflare delivers this website. Depending on enabled features, other services can handle donations, images, notifications or security checks. These can include Ko-fi, Cloudflare R2, Discord, browser push providers, a GeoIP provider, and Google's Gemini account-analysis integration.</p>
      <p class="text-muted-foreground">Available integrations vary. We are confirming active services, data locations and their handling before finalizing this notice. The proposed optional visit statistics make no GeoIP or other provider transfer.</p>
    </section>
    <section class="space-y-3" aria-labelledby="privacy-retention">
      <h2 id="privacy-retention" class="text-3xl">Retention and removal requests</h2>
      <p>Retention periods and removal procedures are being reviewed. Security evidence, financial records, shared discussions, backups and records owned by the game or external services may need different treatment.</p>
      <p class="text-muted-foreground">Withdrawing permission stops future optional collection; it cannot recall an already completed transfer. Deleting data from the website alone does not confirm that game files, images or backup copies are gone. Ask us which steps are complete and which still need attention.</p>
    </section>
  </article>
</template>
