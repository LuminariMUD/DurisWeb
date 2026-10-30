# Duplicate zone 344 map fixtures

Derived from the public `LuminariMUD/Duris` source at
`bc1537d9eb996db126ab20835201909baa91349c`, under `areas/wld/`.
Original source SHA-256 values:

- `long.wld`: `aaa23094013d6ba572f294d4deccfd32bc26f9bd7f420fbee42d449dc0736fe7`
- `temple2.wld`: `85f461bc4ed92df114c2b87d98c423c7050c6a1d84ebc1907ebcd287644db390`

The compact fixtures retain every room's vnum, name, zone, flags and sector, and
every exit's direction, flags, key and destination. Descriptions, keywords and
non-map room extras are omitted. Reset files are minimal synthetic valid records
with the original duplicate `#344` identity. Neither production nor player data
is included. Tests create their own manifest and layout sidecars.

An independent Python projection of the pinned source produced 100 nodes and 251
non-secret edges for Longhollow, and 89 nodes and 196 non-secret edges for Temple2.
The test's graph digests pin all ordered `{nodes,edges}` fields (excluding saved
positions), serialized as compact UTF-8 JSON. They were computed from the original
source, independently of the TypeScript parser, with exit flag 64 excluded.
