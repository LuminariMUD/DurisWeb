// Reference for the Lielz-derived helpers in the Arjinius Client Mudlet package
// (LuminariMUD/duris-client 2.7.0: src/scripts/ArjUI.lua "PORTED INTELLIGENCE" and
// src/scripts/ArjAuto.lua). Keep names, defaults, and command spellings in step
// with those scripts; docs/ongoing-projects/lielz-port.md records the port.

export interface DisplayHelper {
  name: string
  setting: string
  summary: string
  detail: string
}

export interface AutomationToggle {
  name: string
  title: string
  group: 'Combat' | 'Group' | 'Class' | 'Reporting' | 'Ship' | 'Creation'
  summary: string
  trigger: string
  needs?: string
}

export interface AutoVariable {
  name: string
  setWith: string
  defaultValue: string
  usedBy: string
}

export interface CommandEntry {
  command: string
  purpose: string
}

export interface CommandGroup {
  id: string
  title: string
  note?: string
  commands: CommandEntry[]
}

export interface KeyBinding {
  keys: string
  action: string
}

export const lielzSourceVersion = '2.7.0'

export const displayHelpers: DisplayHelper[] = [
  {
    name: 'Alert banners',
    setting: 'alerts',
    summary: 'Bold banners for moments you should not miss.',
    detail:
      'Sanctuary, hellfire, stone skin, heroism, rage, and war cry fading; being disarmed or dropping your weapon; disarm success or failure; someone scrying you; songs finishing or failing; skill improvements; frost beacons; and tracks.',
  },
  {
    name: 'Experience notices',
    setting: 'expTracker',
    summary: 'Each experience gain, with a kills-to-level estimate.',
    detail:
      'Shows the gain, the amount still needed to level, and roughly how many more gains of that size it would take.',
  },
  {
    name: 'Damage counter',
    setting: 'damageTracker',
    summary: 'Per-fight and session damage totals.',
    detail:
      'Uses the server’s combat rounds when available, otherwise the [Damage: N] lines. Type ui damage for the session report and ui damage reset to start over.',
  },
  {
    name: 'Scan formatter',
    setting: 'scanFormat',
    summary: 'Aligned, coloured scan output with a summary line.',
    detail:
      'Each sighting becomes a direction tag, a distance from 1 to 6, and the name, coloured by distance. A summary follows: how many were seen in each direction and the nearest.',
  },
  {
    name: 'Chat timestamps',
    setting: 'chatTimestamps',
    summary: 'An [hh:mm] prefix on chat lines.',
    detail: 'Applies to the chat tabs, so you can see when a conversation happened.',
  },
  {
    name: 'Numpad movement',
    setting: 'keypad',
    summary: 'Walk and act from the numeric keypad.',
    detail: 'See the keypad layout further down this guide.',
  },
]

export const alwaysOnNotes: string[] = [
  'The SHIP tab parses ship contacts, colours them by side, and tracks docking, the captain, maximum speed, and your lock-on target.',
  'Deck, Guns, and Repair skill gains appear as [Ship] notices.',
  'The group panel highlights the most hurt member and shows movement and missing hit points.',
  'Banners mark a target that is already down, one you cannot take down, joining or leaving a group, and a second passenger aboard your ship.',
]

export const automationToggles: AutomationToggle[] = [
  {
    name: 'autoStand',
    title: 'Stand back up',
    group: 'Combat',
    summary: 'Stands you up after a knockdown, and when you finish memorizing or praying.',
    trigger:
      'Missed bashes and mauls, trips, sweeps, quakes, wall bumps, and “studies” or “prayers are complete”.',
  },
  {
    name: 'autoWield',
    title: 'Re-wield after disarm',
    group: 'Combat',
    summary: 'Picks up and wields your weapon after you are disarmed.',
    trigger: 'Disarm and fumble lines.',
    needs: 'Your weapon keyword: wep <keyword>.',
  },
  {
    name: 'autoLoot',
    title: 'Loot coins and essence',
    group: 'Combat',
    summary: 'Takes coins and essence from the corpse after a kill and stores the coins.',
    trigger: '“You receive your share of experience.”',
    needs: 'Your container (default: bag).',
  },
  {
    name: 'autoOre',
    title: 'Collect ore and gems',
    group: 'Combat',
    summary: 'Picks up ore and gems after mining and stores them.',
    trigger: '“Your mining efforts turn up …”',
    needs: 'Your container (default: bag).',
  },
  {
    name: 'trapKill',
    title: 'Ambush arrivals',
    group: 'Combat',
    summary: 'Orders your followers to attack someone who arrives next to you.',
    trigger:
      'Dimension door, shadow travel, a flash of light, entering the game, or bumping into you.',
  },
  {
    name: 'autoRescue',
    title: 'Rescue your allies',
    group: 'Group',
    summary: 'Rescues anyone on your rescue list when they are attacked.',
    trigger: 'Hit, miss, dodge, and attack lines that name a listed ally.',
    needs: 'Names added with rescue add or rescue group.',
  },
  {
    name: 'autoAssist',
    title: 'Assist the group',
    group: 'Group',
    summary: 'Assists a group member who starts hitting something while you are idle.',
    trigger: 'A group member’s attack on someone outside the group, while you are not fighting.',
  },
  {
    name: 'autoGroup',
    title: 'Group on consent',
    group: 'Group',
    summary: 'Groups whoever gives you consent, including pets.',
    trigger:
      '“… has just given you consent”. It also tells someone who is already in another group.',
  },
  {
    name: 'autoFollow',
    title: 'Follow when beckoned',
    group: 'Group',
    summary: 'Follows and consents to someone who beckons you.',
    trigger: '“… beckons you to follow and consent”.',
  },
  {
    name: 'autoRage',
    title: 'Keep the rage going',
    group: 'Class',
    summary: 'Berserkers: rages again three seconds after it abates, if you are still fighting.',
    trigger: '“… your rage abates.”',
  },
  {
    name: 'autoPlay',
    title: 'Keep the song playing',
    group: 'Class',
    summary: 'Bards: plays your song again when it finishes or fails.',
    trigger: '“You finish your song.” and the failed-song line.',
    needs: 'Your song: song <name>.',
  },
  {
    name: 'scanReport',
    title: 'Report scans',
    group: 'Reporting',
    summary: 'Sends each scan summary, with your zone, to the report channel.',
    trigger: 'The scan formatter’s summary line.',
    needs: 'A report channel; it echoes locally until you set one.',
  },
  {
    name: 'eventReport',
    title: 'Report events',
    group: 'Reporting',
    summary:
      'Reports tracks, blackmantle and hellfire hits, scrying, frost beacons, ship lock-ons and sinkings, and newly completed epic zones.',
    trigger: 'The matching game lines.',
    needs: 'A report channel; it echoes locally until you set one.',
  },
  {
    name: 'shipKeys',
    title: 'Ship hotkeys',
    group: 'Ship',
    summary: 'Turns on the Ctrl, Ctrl+Shift, and F10–F12 ship controls listed below.',
    trigger: 'Your key presses only.',
  },
  {
    name: 'roller',
    title: 'Stat roller',
    group: 'Creation',
    summary:
      'During character creation, scores each roll and rerolls until it reaches your threshold, then switches itself off.',
    trigger: 'The creation stat screen. Good = 0.5, very good = 2, excellent = 3.5 per stat.',
    needs: 'Optional: roller threshold <score> (default 20.5).',
  },
]

export const autoVariables: AutoVariable[] = [
  {
    name: 'target',
    setWith: 'tt <name>',
    defaultValue: 'unset',
    usedBy: 'kt, bsht, rbsht, fls, bac, uwt',
  },
  {
    name: 'healtarget',
    setWith: 'ht <name> · weakest',
    defaultValue: 'unset',
    usedBy: 'Your own heal aliases',
  },
  {
    name: 'container',
    setWith: 'container <keyword>',
    defaultValue: 'bag',
    usedBy: 'Container, potion, food, wand, and loot helpers',
  },
  { name: 'weapon', setWith: 'wep <keyword>', defaultValue: 'unset', usedBy: 'autoWield' },
  { name: 'held', setWith: 'held <keyword>', defaultValue: 'unset', usedBy: 'uw, uwt' },
  { name: 'food', setWith: 'food <keyword>', defaultValue: 'unset', usedBy: 'eat' },
  { name: 'door', setWith: 'dd <keyword>', defaultValue: 'door', usedBy: 'od, cd' },
  { name: 'song', setWith: 'song <name>', defaultValue: 'unset', usedBy: 'autoPlay' },
  { name: 'tank', setWith: 'tank <name>', defaultValue: 'unset', usedBy: 'Your own aliases' },
  { name: 'idscroll', setWith: 'idscroll <keyword>', defaultValue: 'unset', usedBy: 'id' },
  {
    name: 'channel',
    setWith: 'report channel <acc|gcc|gsay|nchat|say|echo>',
    defaultValue: 'echo (only you see it)',
    usedBy: 'Every report',
  },
  {
    name: 'cargo · contra',
    setWith: 'cargo <n> · contra <n>',
    defaultValue: '0',
    usedBy: 'qkcargo',
  },
  { name: 'spam', setWith: 'spam <command>', defaultValue: 'unset', usedBy: 'spamon' },
  {
    name: 'Timer intervals',
    setWith: 'spam interval · scan interval · ship interval <seconds>',
    defaultValue: '1 · 5 · 2',
    usedBy: 'Repeat timers',
  },
  {
    name: 'rollThreshold',
    setWith: 'roller threshold <score>',
    defaultValue: '20.5',
    usedBy: 'roller',
  },
]

export const commandGroups: CommandGroup[] = [
  {
    id: 'setup',
    title: 'Help and settings',
    commands: [
      { command: 'auto', purpose: 'Show the ArjAuto command summary in the game window.' },
      { command: 'auto set', purpose: 'List every automation toggle and whether it is on.' },
      {
        command: 'auto <name> on|off',
        purpose: 'Switch one toggle. Names are case-sensitive, for example auto autoStand on.',
      },
      { command: 'vars', purpose: 'List your variables and their values (also auto vars).' },
      { command: 'ui set', purpose: 'List the display toggles; ui set <name> on|off changes one.' },
      { command: 'ui damage', purpose: 'Session damage report; ui damage reset clears it.' },
      {
        command: 'login add <command>',
        purpose: 'Send a command every time you log in, reconnect, or break camp.',
      },
      {
        command: 'login list · login clear',
        purpose: 'Show or remove your login commands. Nothing is sent by default.',
      },
    ],
  },
  {
    id: 'fighting',
    title: 'Fighting',
    commands: [
      { command: 'tt <name>', purpose: 'Set your target. tt on its own clears it.' },
      { command: 'kt', purpose: 'Kill your target.' },
      { command: 'bsh <name>', purpose: 'Set the target and bash it.' },
      { command: 'bsht', purpose: 'Bash your target.' },
      {
        command: 'rbsh · rbsht',
        purpose:
          'Bash now, or queue the bash for the moment your bash lag ends (about 14 seconds). rbsht bashes your target.',
      },
      { command: 'bof', purpose: 'Cancel a queued rebash.' },
      { command: 'tr <name>', purpose: 'Set the target and trample it.' },
      {
        command: 'bac [name]',
        purpose: 'Backstab your target, or set a new target and backstab it.',
      },
      {
        command: 'fls [name]',
        purpose:
          'Flee, then step back the way you came and backstab your target. A failed flee disarms it.',
      },
    ],
  },
  {
    id: 'race-bash',
    title: 'Bash by race',
    note: 'Each sets the target to the race and bashes it.',
    commands: [
      {
        command: 'bo · bt · bd · bu · bv · b1',
        purpose: 'Orc, troll, drow, duergar, goblin, kobold.',
      },
      {
        command: 'br · bj · b2 · bk · bm',
        purpose: 'Ogre, githyanki, drider, thri-kreen, minotaur.',
      },
      {
        command: 'bh · bb · bg · bz · bl · bw',
        purpose: 'Human, barbarian, gnome, githzerai, halfling, dwarf.',
      },
      { command: 'be · bc · bf · b3 · b4', purpose: 'Grey elf, centaur, firbolg, shade, beast.' },
    ],
  },
  {
    id: 'group',
    title: 'Group and support',
    commands: [
      {
        command: 'rescue add <name> · rescue del <name>',
        purpose: 'Add or remove someone autoRescue protects.',
      },
      {
        command: 'rescue group',
        purpose: 'Add everyone in your current group to the rescue list.',
      },
      {
        command: 'rescue list · rescue clear',
        purpose: 'Show the list and whether autoRescue is on, or empty it.',
      },
      {
        command: 'castall <spell>',
        purpose: 'Cast a spell on every player in your group except you.',
      },
      {
        command: 'vitall · virtueall',
        purpose: 'Shortcuts for castall vitality and castall virtue.',
      },
      {
        command: 'weakest',
        purpose: 'Set your heal target to the most hurt group member in the room.',
      },
      { command: 'ht <name>', purpose: 'Set your heal target yourself.' },
      { command: 'fc <name>', purpose: 'Follow and consent to someone.' },
      { command: 'of <command>', purpose: 'Order your followers, for example of kill orc.' },
    ],
  },
  {
    id: 'items',
    title: 'Containers, food, and potions',
    note: 'These use your container variable (default bag).',
    commands: [
      { command: 'pcb · gcb', purpose: 'Put all coins in, or get coins from, your container.' },
      {
        command: 'pab · gab · lib',
        purpose: 'Put everything in, get everything from, or look in your container.',
      },
      {
        command: 'pi <item> · gi <item>',
        purpose: 'Put one item in, or get one item from, your container.',
      },
      {
        command: 'grep <item>',
        purpose: 'Get an item from your container, repair it, and put it back.',
      },
      { command: 'rrep <item>', purpose: 'Remove a worn item, repair it, and wear it again.' },
      { command: 'eat', purpose: 'Get your food from the container and eat it.' },
      { command: 'qf <potion>', purpose: 'Get a potion from your container and quaff it.' },
      { command: 'rq <item>', purpose: 'Remove a worn item and quaff it.' },
      {
        command: 'uw <item> [target]',
        purpose: 'Swap what you hold for an item from your container, then use it.',
      },
      { command: 'uwt', purpose: 'Use the item you hold on your target.' },
      {
        command: 'id <item>',
        purpose:
          'Recite your identify scroll at an item. The result is condensed to one [ID] line.',
      },
    ],
  },
  {
    id: 'corpses',
    title: 'Corpses',
    commands: [
      { command: 'lc [N]', purpose: 'Get everything from the corpse, or from the Nth corpse.' },
      { command: 'lcb [N]', purpose: 'Loot the corpse and put the haul in your container.' },
      { command: 'lic [N]', purpose: 'Look in the corpse.' },
      { command: 'dc <direction>', purpose: 'Drag the corpse in a direction.' },
      {
        command: 'nlc · slc · elc · wlc',
        purpose: 'Step north, south, east, or west and loot the corpse there.',
      },
    ],
  },
  {
    id: 'travel',
    title: 'Doors and travel',
    commands: [
      {
        command: 'od [dir] · cd [dir]',
        purpose: 'Open or close your door keyword (default door).',
      },
      { command: 'uod <door>', purpose: 'Unlock, open, and look at a door.' },
      { command: 'ep · epx', purpose: 'Enter a portal; epx enters, exits, and enters again.' },
      { command: 'egh · emw · ewh', purpose: 'Enter the guildhall, moonwell, or rift.' },
      { command: 'enl [name] · env [N]', purpose: 'Enter a locker, or the first (or Nth) vortex.' },
      { command: 'sw <path>', purpose: 'Speedwalk a path such as 3n2e.' },
      { command: 'lall', purpose: 'Look in all six directions.' },
      { command: 'sfle', purpose: 'Save, then flee.' },
      { command: 'rm', purpose: 'Rest, memorize, and meditate.' },
      { command: 'abq · aba', purpose: 'Ask the bartender for a quest, or abandon it.' },
      { command: 'locate', purpose: 'Report your current area to the report channel.' },
      {
        command: 'dirs <plane>',
        purpose: 'Direction notes for eth, astral, air, fire, water, or neg (recorded in 2021).',
      },
    ],
  },
  {
    id: 'timers',
    title: 'Repeat timers',
    note: 'Spam and scan timers only fire while you are standing and out of combat.',
    commands: [
      { command: 'spam <command>', purpose: 'Choose the command to repeat.' },
      { command: 'spamon · spamoff', purpose: 'Start or stop repeating it.' },
      { command: 'spam interval <seconds>', purpose: 'How often it repeats (default 1).' },
      { command: 'scan timer on|off', purpose: 'Scan automatically.' },
      { command: 'scan interval <seconds>', purpose: 'How often it scans (default 5).' },
    ],
  },
  {
    id: 'ship',
    title: 'Ships',
    note: 'Relative headings use the contact locked in the SHIP tab.',
    commands: [
      {
        command: 'oh <heading> · os <speed>',
        purpose: 'Order a heading or a speed. Speed is capped at the ship’s maximum.',
      },
      { command: 'fff · ffp · ffs · ffr', purpose: 'Fire fore, port, starboard, or rear.' },
      { command: 'ffall', purpose: 'Fire every side.' },
      { command: 'otf · otr', purpose: 'Steer toward your locked target, or directly away.' },
      { command: 'otp · ots', purpose: 'Steer at the target’s bearing plus or minus 90 degrees.' },
      { command: 'oth · otsp', purpose: 'Match the target’s heading or speed.' },
      {
        command: 'le · ln · lne · lnw · ls · lse · lsw · lw',
        purpose: 'Look far east, north, northeast, and so on.',
      },
      {
        command: 'ship poll on|off',
        purpose: 'Look at contacts every 2 seconds. Pauses while docked and resumes under way.',
      },
      { command: 'lout on|off', purpose: 'Look out every 1.8 seconds while out of combat.' },
      {
        command: 'shipf · shipn',
        purpose: 'Scan every 5 seconds, or stop. Also stops after a sinking or with no target.',
      },
      { command: 'jet', purpose: 'Jettison all cargo and contraband.' },
      { command: 'disem', purpose: 'Disembark and stop the ship timers.' },
      {
        command: 'qkcargo',
        purpose:
          'At a dock: sell cargo and contraband, buy your cargo and contra amounts, bank coins, and sail.',
      },
      { command: 'qkreload', purpose: 'At a dock: sell cargo, repair, reload, and bank coins.' },
    ],
  },
  {
    id: 'split',
    title: 'Loot split and epic zones',
    commands: [
      { command: 'split start', purpose: 'Open bidding. Group members bid with gsay bid.' },
      {
        command: 'split roll',
        purpose:
          'Roll for the item, weighted by bidscore. The winner spends points and the others gain one.',
      },
      { command: 'split free', purpose: 'Roll with equal odds. Bidscores do not change.' },
      { command: 'split scores', purpose: 'Announce everyone’s bidscore to the group.' },
      {
        command: 'split set <name> <score> · split flush',
        purpose: 'Set one bidscore, or clear them all.',
      },
      {
        command: 'epic report',
        purpose: 'List the epic zones completed this boot. Type epic zones first.',
      },
    ],
  },
]

export const keypadLayout: KeyBinding[][] = [
  [
    { keys: '/', action: 'scan' },
    { keys: '-', action: 'up' },
  ],
  [
    { keys: '7', action: 'northwest' },
    { keys: '8', action: 'north' },
    { keys: '9', action: 'northeast' },
    { keys: '+', action: 'down' },
  ],
  [
    { keys: '4', action: 'west' },
    { keys: '5', action: 'look' },
    { keys: '6', action: 'east' },
  ],
  [
    { keys: '1', action: 'southwest' },
    { keys: '2', action: 'south' },
    { keys: '3', action: 'southeast' },
  ],
  [{ keys: '0', action: 'flee' }],
]

export const shipKeyBindings: KeyBinding[] = [
  { keys: 'F10 · F11 · F12', action: 'Full speed · speed 20 (or your maximum) · all stop' },
  { keys: 'Ctrl+F · Ctrl+P · Ctrl+S · Ctrl+R', action: 'Fire fore · port · starboard · rear' },
  { keys: 'Ctrl+O', action: 'Sends fire 0' },
  { keys: 'Ctrl+F10', action: 'Match the locked target’s speed' },
  { keys: 'Ctrl+Shift+F · Ctrl+Shift+R', action: 'Steer toward · away from the locked target' },
  { keys: 'Ctrl+Shift+P · Ctrl+Shift+S', action: 'Steer at the target’s bearing +90° · −90°' },
  { keys: 'Ctrl+Shift+H', action: 'Match the locked target’s heading' },
  { keys: 'Ctrl+Shift+N · E · O · W', action: 'Head north · east · south · west (O is south)' },
  { keys: 'Ctrl+Shift+M · Ctrl+Shift+B', action: 'Ram · stop ramming' },
]
