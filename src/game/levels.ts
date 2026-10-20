// Level maps. One char per tile. See LEGEND below.
//
// Walls:  # brick  B blue brick  W/w wallpaper  P wood panel  T kitchen tiles  S stone
//         G slime  M metal  C tech  F fridge  K bookshelf  O "BAD DOG" poster
// Doors:  D door  R red-collar door  U blue-collar door  Y yellow-collar door
//         % secret wall (looks like the wall to its left; opens with USE)
// Exit:   E exit switch (USE it to finish the level)
// Player: ^ > v <   (start, facing N/E/S/W)
// Enemies: m mouse  c chihuahua  d bulldog  X Rex (boss)
// Items:  n catnip(+10)  k kibble(+25)  t tuna(+100 overheal)  a cardboard armor
//         h hairballs  s sardines  b battery  2 sardine shotgun  3 laser pointer
//         r red collar  u blue collar  y yellow collar
// Decor:  L lamp  p plant  o water bowl  x catnip-spray barrel (explodes)

export interface Area {
  x0: number; y0: number; x1: number; y1: number;
  floor: string; ceil: string;
}

export interface LevelDef {
  id: string;
  name: string;
  subtitle: string;
  music: 'living' | 'kitchen' | 'rex';
  floor: string;
  ceil: string;
  areas: Area[];
  map: string[];
  par: number; // par time in seconds (for the intermission screen)
  objective: string;
}

export const LEVELS: LevelDef[] = [
  {
    id: 'E1M1',
    name: 'LE SALON',
    subtitle: 'The Living Room',
    music: 'living',
    floor: 'carpet',
    ceil: 'plaster',
    par: 120,
    objective: 'Find the RED collar, open the red door (south hallway) and hit the EXIT switch.',
    areas: [
      { x0: 12, y0: 1, x1: 23, y1: 6, floor: 'wood', ceil: 'beams' },
      { x0: 25, y0: 1, x1: 30, y1: 6, floor: 'bluecarpet', ceil: 'plaster' },
      { x0: 1, y0: 8, x1: 30, y1: 10, floor: 'wood', ceil: 'light' },
      { x0: 1, y0: 12, x1: 14, y1: 22, floor: 'concrete', ceil: 'darkconcrete' },
      { x0: 17, y0: 12, x1: 30, y1: 22, floor: 'checker', ceil: 'plaster' },
    ],
    map: [
      'WWWWWWWWWWWWKKKKKKKKKKKKKBBBBBBB',
      'W...n......W............K......B',
      'W..........W...m....m...K..d...B',
      'W.>........D......p.....K......B',
      'W..L....L..W............K...t..B',
      'W.h........W..m......m..K..m...B',
      'W..........W............K......B',
      'WWWWWDWWWWWWKKKKKKDKKKKKKBBDBBBB',
      'P..h..........m.............n..P',
      'P..L.......................L...P',
      'P..............................P',
      'SSSSSSSDSSSSSSSS######R#########',
      'S..............S#..............#',
      'S...m......m...S#..x.......x...#',
      'S..SS......SS..S#..............#',
      'S..SS..d...SS..S#...m.....m....#',
      'S..............S#...########...#',
      'S..h.....m.....S#...#..k...#...#',
      'S..SS......SS..S#...#......#...#',
      'S..SS......SS..S#...###..###...#',
      'S...........a..S#..............#',
      'S.m..........m.S#..d........n..#',
      'S......r.......S#..............#',
      'SSSSSSSSSSSSSSSS########E#######',
    ],
  },
  {
    id: 'E1M2',
    name: 'LA CUISINE',
    subtitle: 'Kitchen Nightmare',
    music: 'kitchen',
    floor: 'checker',
    ceil: 'light',
    par: 200,
    objective: 'Grab the SARDINE SHOTGUN, find the BLUE and YELLOW collars, reach the EXIT in the pantry.',
    areas: [
      { x0: 1, y0: 1, x1: 9, y1: 8, floor: 'wood', ceil: 'plaster' },
      { x0: 20, y0: 12, x1: 30, y1: 22, floor: 'concrete', ceil: 'darkconcrete' },
      { x0: 1, y0: 17, x1: 9, y1: 22, floor: 'bluecarpet', ceil: 'plaster' },
    ],
    map: [
      'PPPPPPPPPPTTTTTTTTTTTTTTTTTTTTTT',
      'P........PT.........FF.........T',
      'P.^......PT..m...........c.....T',
      'P........DT.........FF.........T',
      'P..2.....PT...TTT.......TTT....T',
      'P........PT...TkT...x...T.T..c.T',
      'P..h..p..PT...T.T.......TaT....T',
      'P........PT.........m..........T',
      'P.....n..PT....c.......FF......T',
      'PPPPDPPPPPTTTTTTTTTTDTTTTTTDTTTT',
      'T..........m.........T.......u.T',
      'T...x.........s......T.....d...T',
      'TTTTTTTTDTTTTTTTTTTTTTTTTTTTTTTT',
      'T..............T...............M',
      'T..c....m......U..m........c...M',
      'T......L.......T...MMM...MMM...M',
      'T...TTTTTTT....T...M.......M...M',
      'TTT%TTTTTTTTYTTTT..M...d...M...M',
      'P.....P....T...T...M.......M...M',
      'P..t..P..k.T.s.T...MMMM.MMMM...M',
      'P..........T...T...............M',
      'P..s..P..c.T.c.T.....y......m..M',
      'P.....P....T...T...............M',
      'PPPPPPPTTTTTTETTTMMMMMMMMMMMMMMM',
    ],
  },
  {
    id: 'E1M3',
    name: 'LA CAVE',
    subtitle: "Rex's Basement",
    music: 'rex',
    floor: 'darkconcrete',
    ceil: 'metal',
    par: 300,
    objective: 'Take the LASER POINTER, survive the sewer, defeat REX in his arena, then press the EXIT switch.',
    areas: [
      { x0: 1, y0: 1, x1: 9, y1: 6, floor: 'concrete', ceil: 'darkconcrete' },
      { x0: 11, y0: 1, x1: 30, y1: 6, floor: 'water', ceil: 'darkconcrete' },
      { x0: 9, y0: 13, x1: 30, y1: 26, floor: 'metal', ceil: 'metal' },
    ],
    map: [
      'SSSSSSSSSSGGGGGGGGGGGGGGGGGGGGGG',
      'S.......SG.....m.......c.......G',
      'S.v.....SG..GGG....GGG....GGG..G',
      'S.......DG..G.......d......hG..G',
      'S..3....SG..GGG....GGG....GGG..G',
      'S.h...b.SG.c.....m.....c.......G',
      'S.......SG.....x..........b....G',
      'SSSSDSSSSGGGGGGGGGGGGGGGGGGDGGGG',
      'S.......S......................S',
      'S..m....S..d....c.....m....n...S',
      'S.......R......................S',
      'S..t....SSSSSSSSSSSSSSSSSSSSSSDS',
      'S...r...SMMMMMMMMMMEMMMMMMMMMM.S',
      'SSSSSSSSSM...................M.S',
      'S.......CM..x.............x..M.S',
      'S.a.....CM...................M.S',
      'S...k...CM......C.....C......M.S',
      'S.......CM...................M.S',
      'S..s.....D.........X.........U.S',
      'S.......CM...................M.S',
      'S...b...CM......C.....C......M.S',
      'S.......CM...................M.S',
      'S..n....CM..x.............x..M.S',
      'S.......CM...................M.S',
      'SSSSSSSSSMMMMMMMMMMMMMMMMMMMMM.S',
      'S..............u...............S',
      'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
    ],
  },
];
