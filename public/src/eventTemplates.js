// Event and NPC templates for Idle Ecologist

// ── NPC template ─────────────────────────────────────────────────────────────
export class NPC {
  constructor({ name, icon }) {
    this.name = name;
    this.icon = icon; // GID from tileset
  }
}

// ── Event template ────────────────────────────────────────────────────────────
export class EventTemplate {
  constructor({ criteria, questGiver, reward, quest, questDialog }) {
    this.criteria    = criteria;    // { hoursSocializing?, cropCount?: { type, amount } }
    this.questGiver  = questGiver;  // NPC instance
    this.reward      = reward;      // { gold }
    this.quest       = quest;       // { cropType, cropAmount }
    this.questDialog = questDialog; // string
  }
}

// ── NPCs ──────────────────────────────────────────────────────────────────────
const npcs = {
  tallamy:  new NPC({ name: 'Dr. Tallamy',    icon: 4986 }),
  rosario:  new NPC({ name: 'Chef Rosario',   icon: 4736 }),
  briggs:   new NPC({ name: 'Farmer Briggs',  icon: 5236 }),
  chen:     new NPC({ name: 'Mayor Chen',     icon: 5736 }),
};

// ── Quest data table ──────────────────────────────────────────────────────────
// Each row defines one quest that unlocks when the player has grown enough of
// a crop and spent enough in-game hours socializing.
//
// Columns:
//   npc            – key in the npcs table above
//   cropId         – crop that must be grown to trigger this quest (criteria)
//   grownNeeded    – how many of that crop must be grown (lifetime) to unlock
//   socialHours    – total socializing hours needed to unlock
//   giveType       – which crop to hand in (usually same as cropId)
//   giveAmount     – how many to hand in
//   rewardGold     – gold awarded on completion
//   dialog         – NPC's request text
//
const QUEST_TABLE = [
  {
    npc: 'rosario',
    cropId:      'strawberry', grownNeeded: 25,  socialHours: 0.5,
    giveType:    'strawberry', giveAmount:  20,  rewardGold: 500,
    dialog: 'My café just opened and I need fresh strawberries for this weekend\'s menu. Can you spare 20?',
  },
  {
    npc: 'briggs',
    cropId:      'greenOnion', grownNeeded: 50,  socialHours: 1,
    giveType:    'greenOnion', giveAmount:  30,  rewardGold: 1350,
    dialog: 'I\'m running a workshop on companion planting and need green onions as a demonstration crop. 30 should do it.',
  },
  {
    npc: 'tallamy',
    cropId:      'potato',     grownNeeded: 30,  socialHours: 1.5,
    giveType:    'potato',     giveAmount:  25,  rewardGold: 2125,
    dialog: 'I\'m studying soil microbiomes around root vegetables. I need 25 potatoes from a healthy plot — yours looks perfect.',
  },
  {
    npc: 'rosario',
    cropId:      'onion',      grownNeeded: 40,  socialHours: 3,
    giveType:    'onion',      giveAmount:  30,  rewardGold: 4800,
    dialog: 'The harvest festival is coming up and onion soup is on the menu. I need 30 onions, fresh as possible.',
  },
  {
    npc: 'tallamy',
    cropId:      'carrot',     grownNeeded: 25,  socialHours: 5,
    giveType:    'carrot',     giveAmount:  20,  rewardGold: 6000,
    dialog: 'My research on beta-carotene in organically grown carrots needs samples. 20 carrots from your farm would be ideal.',
  },
  {
    npc: 'chen',
    cropId:      'blueberry',  grownNeeded: 30,  socialHours: 8,
    giveType:    'blueberry',  giveAmount:  25,  rewardGold: 15000,
    dialog: 'The town is hosting a charity jam-making event. We\'re short on blueberries — 25 of them would save the day.',
  },
  {
    npc: 'briggs',
    cropId:      'parsnip',    grownNeeded: 20,  socialHours: 12,
    giveType:    'parsnip',    giveAmount:  15,  rewardGold: 18000,
    dialog: 'Old-timers swear parsnip stew keeps you going through winter. I\'d love 15 to test the recipe at the community hall.',
  },
  {
    npc: 'rosario',
    cropId:      'lettuce',    grownNeeded: 20,  socialHours: 18,
    giveType:    'lettuce',    giveAmount:  15,  rewardGold: 37500,
    dialog: 'A food critic is visiting the region and I\'m preparing a signature salad. I need 15 heads of the crispest lettuce available.',
  },
  {
    npc: 'tallamy',
    cropId:      'cauliflower', grownNeeded: 15, socialHours: 25,
    giveType:    'cauliflower', giveAmount:  10, rewardGold: 55000,
    dialog: 'Cauliflower is one of the best indicators of pesticide-free soil. 10 heads from your farm would anchor my published study.',
  },
  {
    npc: 'chen',
    cropId:      'rice',       grownNeeded: 15,  socialHours: 35,
    giveType:    'rice',       giveAmount:  10,  rewardGold: 120000,
    dialog: 'The regional agricultural expo wants a local farm to submit a rice sample. Yours would represent the whole valley — I need 10 portions.',
  },
  {
    npc: 'briggs',
    cropId:      'broccoli',   grownNeeded: 10,  socialHours: 50,
    giveType:    'broccoli',   giveAmount:  8,   rewardGold: 224000,
    dialog: 'Broccoli is one of the hardest crops to grow cleanly at scale. If you can spare 8, I\'ll enter them in the county show on your behalf.',
  },
  {
    npc: 'tallamy',
    cropId:      'asparagus',  grownNeeded: 10,  socialHours: 70,
    giveType:    'asparagus',  giveAmount:  8,   rewardGold: 520000,
    dialog: 'Asparagus beds take years to establish. Yours is thriving. I\'d like 8 spears to submit as the benchmark for my ecological farming index.',
  },
];

// ── Generate events from table ────────────────────────────────────────────────
export const allEvents = QUEST_TABLE.map(q => new EventTemplate({
  criteria: {
    hoursSocializing: q.socialHours,
    cropCount: { type: q.cropId, amount: q.grownNeeded },
  },
  questGiver:  npcs[q.npc],
  reward:      { gold: q.rewardGold },
  quest:       { cropType: q.giveType, cropAmount: q.giveAmount },
  questDialog: q.dialog,
}));
