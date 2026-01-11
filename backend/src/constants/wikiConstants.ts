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
  256: 'Ultravision',
  512: 'Armor',
  1024: 'Wraithform',
  2048: 'Waterbreath',
  8192: 'Protect Evil',
  32768: 'Slow Poison',
  65536: 'Protect Good',
  524288: 'Sneak',
  1048576: 'Hide',
  16777216: 'Barkskin',
  33554432: 'Infravision',
  67108864: 'Levitate',
  134217728: 'Fly',
  268435456: 'Aware',
  536870912: 'Prot Fire',
};

export const AFF2_NAMES: Record<number, string> = {
  1: 'Fireshield',
  2: 'Ultravision',
  4: 'Detect Evil',
  8: 'Detect Good',
  16: 'Detect Magic',
  32: 'Major Physical',
  64: 'Major Mental',
  128: 'Iceshield',
  256: 'Major Globe',
  512: 'Prot Cold',
  1024: 'Prot Elec',
  2048: 'Prot Gas',
  8192: 'Prot Acid',
  131072: 'Passdoor',
  262144: 'Regenerate',
  524288: 'Camouflage',
  1048576: 'Breathwater',
  4194304: 'True Sight',
  8388608: 'Solidity',
  536870912: 'Hover',
};

export const AFF3_NAMES: Record<number, string> = {
  2: 'Protection',
  4: 'Faerie Fire',
  1024: 'Curse',
  8192: 'Sanctuary',
  16384: 'Prot From Undead',
  262144: 'Warding',
  8388608: 'Anti-Magic',
  33554432: 'Blink',
  268435456: 'Water Walk',
  536870912: 'Clarity',
};

export const AFF4_NAMES: Record<number, string> = {
  1: 'Thornshield',
  2: 'Cloak of Fear',
  4: 'Dancing Shield',
  32: 'Free Action',
  64: 'Enlightenment',
  65536: 'Prot Lightning',
  262144: 'Absorb',
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

// class bit values (used in anti_flags field)
export const CLASS_BITS: number[] = [
  1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144,
  524288, 1048576, 2097152, 4194304, 8388608, 16777216, 33554432, 67108864, 134217728, 268435456,
];

// race ids (sequential, anti_flags2 stores race bitvector)
export const RACE_IDS: number[] = Array.from({ length: 50 }, (_, i) => i + 1);

// helper: get spell effects from bitvectors
export function getSpellEffects(
  bitvector: number = 0,
  bitvector2: number = 0,
  bitvector3: number = 0,
  bitvector4: number = 0
): string[] {
  const effects: string[] = [];
  for (const [flag, name] of Object.entries(AFF_NAMES)) {
    if (bitvector & parseInt(flag)) effects.push(name);
  }
  for (const [flag, name] of Object.entries(AFF2_NAMES)) {
    if (bitvector2 & parseInt(flag)) effects.push(name);
  }
  for (const [flag, name] of Object.entries(AFF3_NAMES)) {
    if (bitvector3 & parseInt(flag)) effects.push(name);
  }
  for (const [flag, name] of Object.entries(AFF4_NAMES)) {
    if (bitvector4 & parseInt(flag)) effects.push(name);
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
