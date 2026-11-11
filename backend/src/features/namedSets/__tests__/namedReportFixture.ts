/** Builds report text in the exact shape the MUD's generate_named_report() writes. */

const HEADER =
  '&+YCurrent listing of spells granted by named sets by zone.&n\n' +
  '&+Y-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=&n\n\n' +
  "  &+MNotes&n: &+W*&n if a zone isn't listed, sets still grant hitpoints\n" +
  '         &+W*&n caster level of the spell(s) is based on number of items\n' +
  '           going over set requirements will increase caster level\n' +
  '         &+W*&n &+Gthese&n spells have a cooldown of 1 minute\n' +
  '           &+ythese&n spells have a cooldown of 5 minutes\n\n' +
  '         * Guardian Spirits requires a Shaman wearer.\n\n' +
  '&+Y ZONE ID / NAME                                       &+W|&+B SPELLS GRANTED &+W(&+Ypieces required&n&+W)&n\n' +
  '&+W-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=&n\n';

export type FixtureSpell = [color: 'B' | 'G' | 'y', name: string, pieces: number];

function spellText([color, name, pieces]: FixtureSpell): string {
  return `&+${color}${name} &+W(&+Y${pieces}&+W)&n`;
}

function padAnsi(name: string, length: number): string {
  const visible = name.replace(/&(?:=[a-zA-Z]{2}|[+-][a-zA-Z*]|[nN])/g, '').length;
  return name + ' '.repeat(Math.max(0, length - visible));
}

export function zoneLine(zone: number, name: string, spells: FixtureSpell[]): string {
  return ` #${zone} ${padAnsi(name, 45)}    &+W|&n ` + spells.map(spellText).join('&+W,&n ') + '\n';
}

export function namedReport(lines: string[]): string {
  return HEADER + lines.join('');
}

export const SAMPLE_REPORT = namedReport([
  zoneLine(14, '&+gThe Goblin Warrens&n', [
    ['B', 'armor', 3],
    ['B', 'bless', 3],
  ]),
  zoneLine(40, 'Orc Stronghold', [['y', 'conjure elemental', 6]]),
  zoneLine(73, '&+rFire &+RGiants&n Keep', [['G', 'stone skin', 6]]),
  zoneLine(300, 'Quiet Marsh', []),
]);
