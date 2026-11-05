/**
 * shared constants for wiki objects and mobs
 * used by wikiService.ts and import-wiki-data.ts
 */

// object type names (item_type field)
export const OBJECT_TYPE_NAMES: Record<number, string> = {
  0: 'Undefined',
  1: 'Light',
  2: 'Scroll',
  3: 'Wand',
  4: 'Staff',
  5: 'Weapon',
  6: 'Fire Weapon',
  7: 'Missile',
  8: 'Treasure',
  9: 'Armor',
  10: 'Potion',
  11: 'Worn',
  12: 'Other',
  13: 'Trash',
  14: 'Trap',
  15: 'Container',
  16: 'Note',
  17: 'Drink Container',
  18: 'Key',
  19: 'Food',
  20: 'Money',
  21: 'Pen',
  22: 'Boat',
  23: 'Fountain',
  24: 'Throw',
  25: 'Grenade',
  26: 'Bow',
  27: 'Sling',
  28: 'Crossbow',
  29: 'Bolt',
  30: 'Arrow',
  31: 'Rock',
  32: 'Flying Boat',
  33: 'Spellbook',
  34: 'Tome',
  35: 'Portal',
  36: 'Rope',
  37: 'Instrument',
  38: 'Reagent',
  39: 'Disguise',
  40: 'Poison',
  41: 'Quest',
  42: 'Artifact',
  43: 'Keyring',
};

// wear slot flags -> slot_id mapping (bit values to sequential ids)
export const WEAR_SLOT_FLAGS: Record<number, number> = {
  // 1: TAKE - not a wear slot
  2: 1, // finger
  4: 2, // neck
  8: 3, // body
  16: 4, // head
  32: 5, // legs
  64: 6, // feet
  128: 7, // hands
  256: 8, // arms
  512: 9, // shield
  1024: 10, // about
  2048: 11, // waist
  4096: 12, // wrist
  8192: 13, // wield
  16384: 14, // hold
  32768: 15, // throw
  65536: 16, // light
  131072: 17, // eyes
  262144: 18, // face
  524288: 19, // ear
  1048576: 20, // quiver
  2097152: 21, // insignia
  4194304: 22, // back
  8388608: 23, // belt
  16777216: 24, // horse body
  33554432: 25, // tail
  67108864: 26, // nose
  134217728: 27, // horn
  268435456: 28, // ioun
  536870912: 29, // spider body
};

// slot_id (sequential) to name - matches import script mapping
export const SLOT_ID_NAMES: Record<number, string> = {
  1: 'finger',
  2: 'neck',
  3: 'body',
  4: 'head',
  5: 'legs',
  6: 'feet',
  7: 'hands',
  8: 'arms',
  9: 'shield',
  10: 'about',
  11: 'waist',
  12: 'wrist',
  13: 'wield',
  14: 'hold',
  15: 'throw',
  16: 'light',
  17: 'eyes',
  18: 'face',
  19: 'ear',
  20: 'quiver',
  21: 'insignia',
  22: 'back',
  23: 'belt',
  24: 'horse body',
  25: 'tail',
  26: 'nose',
  27: 'horn',
  28: 'ioun',
  29: 'spider body',
};

// aff bitvector names for spell effects
export const AFF_NAMES: Record<number, string> = {
  1: 'Blind',
  2: 'Invisible',
  4: 'Farsee',
  8: 'Detect Invisible',
  16: 'Haste',
  32: 'Sense Life',
  64: 'Minor Globe',
  128: 'Stone Skin',
  256: 'Underdark Vision',
  512: 'Armor',
  1024: 'Wraithform',
  2048: 'Waterbreath',
  4096: 'Knocked Out',
  8192: 'Protect Evil',
  16384: 'Bound',
  32768: 'Slow Poison',
  65536: 'Protect Good',
  131072: 'Sleep',
  262144: 'Skill Aware',
  524288: 'Sneak',
  1048576: 'Hide',
  2097152: 'Fear',
  4194304: 'Charm',
  8388608: 'Meditate',
  16777216: 'Barkskin',
  33554432: 'Infravision',
  67108864: 'Levitate',
  134217728: 'Fly',
  268435456: 'Aware',
  536870912: 'Prot Fire',
  1073741824: 'Camping',
  2147483648: 'Biofeedback',
  4294967296: 'Infernal Fury',
  8589934592: 'Freedom of Movement',
  17179869184: 'Sanctum Draconis',
};

export const AFF2_NAMES: Record<number, string> = {
  1: 'Fireshield',
  2: 'Ultravision',
  4: 'Detect Evil',
  8: 'Detect Good',
  16: 'Detect Magic',
  32: 'Major Physical',
  64: 'Prot Cold',
  128: 'Prot Lightning',
  256: 'Minor Paralysis',
  512: 'Major Paralysis',
  1024: 'Slow',
  2048: 'Globe',
  4096: 'Prot Gas',
  8192: 'Prot Acid',
  16384: 'Poisoned',
  32768: 'Soulshield',
  65536: 'Silenced',
  131072: 'Concealment',
  262144: 'Vampiric Touch',
  524288: 'Stunned',
  1048576: 'Earth Aura',
  2097152: 'Water Aura',
  4194304: 'Fire Aura',
  8388608: 'Air Aura',
  16777216: 'Holding Breath',
  33554432: 'Memorizing',
  67108864: 'Is Drowning',
  134217728: 'Passdoor',
  268435456: 'Flurry',
  536870912: 'Casting',
  1073741824: 'Scribing',
  2147483648: 'Hunter',
};

export const AFF3_NAMES: Record<number, string> = {
  1: 'Tensors Disc',
  2: 'Tracking',
  4: 'Singing',
  8: 'Ectoplasmic Form',
  16: 'Absorbing',
  32: 'Prot Animal',
  64: 'Spirit Ward',
  128: 'Greater Spirit Ward',
  256: 'Non Detection',
  512: 'Silver',
  1024: 'Plus One',
  2048: 'Plus Two',
  4096: 'Plus Three',
  8192: 'Plus Four',
  16384: 'Plus Five',
  32768: 'Enlarge',
  65536: 'Reduce',
  131072: 'Cover',
  262144: 'Four Arms',
  524288: 'Inertial Barrier',
  1048576: 'Lightning Shield',
  2097152: 'Cold Shield',
  4194304: 'Cannibalize',
  8388608: 'Swimming',
  16777216: 'Tower of Iron Will',
  33554432: 'Underwater',
  67108864: 'Blur',
  134217728: 'Enhance Healing',
  268435456: 'Elemental Form',
  536870912: 'Pass Without Trace',
  1073741824: 'Paladin Aura',
  2147483648: 'Famine',
  4294967296: 'Vivernae Concordia',
};

export const AFF4_NAMES: Record<number, string> = {
  1: 'Looter',
  2: 'Carry Plague',
  4: 'Sacking',
  8: 'Sense Follower',
  16: 'Stornogs Spheres',
  32: 'Stornogs Greater Spheres',
  64: 'Vampire Form',
  128: 'No Unmorph',
  256: 'Holy Sacrifice',
  512: 'Battle Ecstasy',
  1024: 'Dazzler',
  2048: 'Phantasmal Form',
  4096: 'No Fear',
  8192: 'Regeneration',
  16384: 'Deaf',
  32768: 'Battletide',
  65536: 'Epic Increase',
  131072: 'Mage Flame',
  262144: 'Globe Of Darkness',
  524288: 'Deflect',
  1048576: 'Hawk Vision',
  2097152: 'Multi Class',
  4194304: 'Sanctuary',
  8388608: 'Hellfire',
  16777216: 'Sense Holiness',
  33554432: 'Prot Living',
  67108864: 'Detect Illusion',
  134217728: 'Ice Aura',
  268435456: 'Reverse Polarity',
  536870912: 'Negative Shield',
  1073741824: 'Tupor',
  2147483648: 'Wildmagic',
};

// act flags for mobs - bitvector to flag_id mapping
export const ACT_FLAGS: Record<number, number> = {
  1: 1,
  2: 2,
  4: 3,
  8: 4,
  16: 5,
  32: 6,
  64: 7,
  128: 8,
  256: 9,
  512: 10,
  1024: 11,
  2048: 12,
  4096: 13,
  8192: 14,
  16384: 15,
  32768: 16,
  65536: 17,
  131072: 18,
  262144: 19,
  524288: 20,
  1048576: 21,
  2097152: 22,
  4194304: 23,
  8388608: 24,
  16777216: 25,
  33554432: 26,
  67108864: 27,
  134217728: 28,
  268435456: 29,
  536870912: 30,
  1073741824: 31,
  2147483648: 32,
};

// extra flags bits for ALLOWED_CLASSES/ALLOWED_RACES
export const ITEM_ALLOWED_RACES = 512; // BIT_10
export const ITEM_ALLOWED_CLASSES = 1024; // BIT_11

// Class bits and names follow the MUD class_names_table.
export const OBJECT_CLASS_NAMES: Record<number, string> = {
  1: 'Warrior',
  2: 'Ranger',
  4: 'Psionicist',
  8: 'Paladin',
  16: 'Anti-Paladin',
  32: 'Cleric',
  64: 'Monk',
  128: 'Druid',
  256: 'Shaman',
  512: 'Sorcerer',
  1024: 'Necromancer',
  2048: 'Conjurer',
  4096: 'Rogue',
  8192: 'Assassin',
  16384: 'Mercenary',
  32768: 'Bard',
  65536: 'Thief',
  131072: 'Warlock',
  262144: 'Mindflayer',
  524288: 'Alchemist',
  1048576: 'Berserker',
  2097152: 'Reaver',
  4194304: 'Illusionist',
  8388608: 'Blighter',
  16777216: 'Dreadlord',
  33554432: 'Ethermancer',
  67108864: 'Avenger',
  134217728: 'Theurgist',
  268435456: 'Summoner',
  536870912: 'Dragoon',
};

export const CLASS_BITS: number[] = Object.keys(OBJECT_CLASS_NAMES).map(Number);

// anti2_flags has one bit for each of races 1-32; larger IDs have no bit.
export const RACE_IDS: number[] = Array.from({ length: 32 }, (_, i) => i + 1);

// helper: get spell effects from bitvectors
export function getSpellEffects(
  bitvector: number = 0,
  bitvector2: number = 0,
  bitvector3: number = 0,
  bitvector4: number = 0,
): string[] {
  const effects: string[] = [];
  for (const [value, names] of [
    [bitvector, AFF_NAMES],
    [bitvector2, AFF2_NAMES],
    [bitvector3, AFF3_NAMES],
    [bitvector4, AFF4_NAMES],
  ] as const) {
    if (!Number.isSafeInteger(value)) throw new Error('Invalid wiki affect mask');
    const mask = BigInt.asUintN(64, BigInt(value));
    for (const [flag, name] of Object.entries(names)) {
      if ((mask & BigInt(flag)) !== 0n) effects.push(name);
    }
  }
  return effects;
}

// helper: get slot ids from wear flags bitvector
export function getSlotIds(wearFlags: number): number[] {
  const slots: number[] = [];
  for (const [flag, slotId] of Object.entries(WEAR_SLOT_FLAGS)) {
    if (wearFlags & parseInt(flag)) slots.push(slotId);
  }
  return slots;
}

// helper: get flag ids from act flags bitvector
export function getFlagIds(actFlags: number): number[] {
  const flags: number[] = [];
  for (const [flag, flagId] of Object.entries(ACT_FLAGS)) {
    if (actFlags & parseInt(flag)) flags.push(flagId);
  }
  return flags;
}
