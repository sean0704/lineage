import type { Rarity } from './items';

/** 程序化 3D 模型規格（純資料，由 render/models 解讀） */
export type HeadStyle = 'goblin' | 'skull' | 'zombie' | 'orc' | 'helm' | 'hood' | 'horned' | 'ghoul';
export type WeaponStyle = 'club' | 'bow' | 'axe' | 'spear' | 'sword' | 'staff' | 'flameSword' | 'claws' | 'scythe';

export type ModelSpec =
  | {
      kind: 'humanoid';
      skin: number;
      cloth: number;
      metal?: number;
      head: HeadStyle;
      weapon: WeaponStyle;
      shield?: boolean;
      cape?: number;
      /** 整體縮放（1 = 約與玩家同高） */
      scale: number;
      /** 體型寬度係數 */
      bulk: number;
      eye: number;
      hunch?: number;
      bony?: boolean;
      aura?: number;
    }
  | { kind: 'spider'; body: number; accent: number; scale: number; eye: number }
  | { kind: 'hound'; body: number; accent: number; heads: number; scale: number; eye: number }
  | { kind: 'golem'; body: number; accent: number; scale: number; eye: number }
  | { kind: 'eye'; body: number; iris: number; scale: number };

export type InflictStatus = 'poison' | 'paralyze';

export interface MonsterMove {
  id: string;
  name: string;
  /** 被選中的權重 */
  weight: number;
  /** 傷害倍率；0 表示非傷害技能 */
  power: number;
  /** 命中修正（加到命中率） */
  accuracy?: number;
  /** 無視防禦比例 0~1 */
  pierce?: number;
  /** 需要先蓄力一回合，並顯示此前兆文字 */
  telegraph?: string;
  inflict?: { status: InflictStatus; chance: number; turns: number };
  drainMp?: number;
  /** 僅在怪物 HP 比例低於此值時可用 */
  hpBelow?: number;
  /** 使用後需等待的回合數 */
  cooldown?: number;
  /** 戰鬥訊息動詞，例如「揮舞木棍砸向你」 */
  verb: string;
}

export interface MonsterDef {
  key: string;
  name: string;
  rarity: Rarity;
  boss?: boolean;
  /** 相對於樓層等級的偏移 */
  levelOffset: number;
  hpMul: number;
  atkMul: number;
  defMul: number;
  xpMul: number;
  goldMul: number;
  /** 首領狂暴門檻（HP 比例） */
  enrageAt?: number;
  moves: MonsterMove[];
  drops: { item: string; chance: number }[];
  model: ModelSpec;
  flavor: string;
}

const strike = (verb: string, weight = 6): MonsterMove => ({ id: 'attack', name: '攻擊', weight, power: 1, verb });

const list: MonsterDef[] = [
  // ───── 1F ─────
  {
    key: 'goblin', name: '妖魔', rarity: 'common', levelOffset: 0, hpMul: 1, atkMul: 1, defMul: 1, xpMul: 1, goldMul: 1,
    moves: [strike('揮舞木棍砸向你')],
    drops: [{ item: 'redPotion', chance: 0.25 }, { item: 'dagger', chance: 0.04 }],
    model: { kind: 'humanoid', skin: 0x6b8f3a, cloth: 0x5a3b22, head: 'goblin', weapon: 'club', scale: 0.82, bulk: 1, eye: 0xffd23a, hunch: 0.25 },
    flavor: '地監最常見的小型妖魔，成群出沒。',
  },
  {
    key: 'goblinArcher', name: '妖魔弓箭手', rarity: 'common', levelOffset: 1, hpMul: 0.85, atkMul: 1.05, defMul: 0.8, xpMul: 1.05, goldMul: 1.1,
    moves: [strike('近身亂揮短刀', 3), { id: 'shoot', name: '瞄準射擊', weight: 4, power: 1.35, accuracy: -0.1, verb: '拉滿弓弦射出一箭' }],
    drops: [{ item: 'shortBow', chance: 0.06 }, { item: 'redPotion', chance: 0.2 }],
    model: { kind: 'humanoid', skin: 0x7a9a44, cloth: 0x3d5a2a, head: 'goblin', weapon: 'bow', scale: 0.8, bulk: 0.9, eye: 0xffd23a, hunch: 0.2 },
    flavor: '躲在暗處放冷箭的妖魔。',
  },
  {
    key: 'skeleton', name: '骷髏', rarity: 'common', levelOffset: 1, hpMul: 0.9, atkMul: 1.05, defMul: 1.2, xpMul: 1, goldMul: 0.9,
    moves: [strike('以生鏽的長劍劈砍')],
    drops: [{ item: 'leatherHelm', chance: 0.05 }],
    model: { kind: 'humanoid', skin: 0xd8d0b8, cloth: 0x2b2b30, head: 'skull', weapon: 'sword', scale: 1, bulk: 0.75, eye: 0x6fd3ff, bony: true },
    flavor: '被黑魔法喚醒的亡者骸骨。',
  },
  {
    key: 'zombie', name: '人形殭屍', rarity: 'common', levelOffset: 2, hpMul: 1.45, atkMul: 0.9, defMul: 0.6, xpMul: 1.15, goldMul: 0.8,
    moves: [strike('伸出腐爛的雙手撕抓'), { id: 'bite', name: '腐爛啃咬', weight: 2, power: 1.1, inflict: { status: 'poison', chance: 0.5, turns: 3 }, verb: '張口啃咬' }],
    drops: [{ item: 'redPotion', chance: 0.3 }, { item: 'antidote', chance: 0.15 }],
    model: { kind: 'humanoid', skin: 0x7c8a6a, cloth: 0x4a4038, head: 'zombie', weapon: 'claws', scale: 1, bulk: 1.05, eye: 0xc8ff6a, hunch: 0.35 },
    flavor: '行動遲緩卻異常耐打的屍體。',
  },
  // ───── 2F ─────
  {
    key: 'goblinFighter', name: '妖魔鬥士', rarity: 'common', levelOffset: 0, hpMul: 1.15, atkMul: 1.1, defMul: 1.2, xpMul: 1.1, goldMul: 1.1,
    moves: [strike('揮動手斧'), { id: 'cleave', name: '猛力劈砍', weight: 2, power: 1.5, accuracy: -0.08, verb: '高舉手斧全力劈下' }],
    drops: [{ item: 'woodenShield', chance: 0.08 }, { item: 'greatAxe', chance: 0.02 }],
    model: { kind: 'humanoid', skin: 0x5f7f30, cloth: 0x6b2a1e, metal: 0x8a8f99, head: 'goblin', weapon: 'axe', shield: true, scale: 0.92, bulk: 1.2, eye: 0xff8a3a, hunch: 0.15 },
    flavor: '披著鐵片的妖魔戰士。',
  },
  {
    key: 'skeletonArcher', name: '骷髏弓箭手', rarity: 'common', levelOffset: 1, hpMul: 0.8, atkMul: 1.1, defMul: 1, xpMul: 1.05, goldMul: 1,
    moves: [strike('以弓身敲擊', 2), { id: 'shoot', name: '骨箭', weight: 5, power: 1.3, accuracy: -0.05, verb: '射出一支骨箭' }],
    drops: [{ item: 'shortBow', chance: 0.08 }, { item: 'leatherPants', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0xcfc6ae, cloth: 0x3a2f2a, head: 'skull', weapon: 'bow', scale: 1, bulk: 0.7, eye: 0x6fd3ff, bony: true },
    flavor: '空洞眼窩中燃著藍火的射手。',
  },
  {
    key: 'sparto', name: '史巴托', rarity: 'uncommon', levelOffset: 2, hpMul: 1.1, atkMul: 1.15, defMul: 1.5, xpMul: 1.3, goldMul: 1.3,
    moves: [strike('以青銅劍突刺'), { id: 'shieldBash', name: '盾擊', weight: 2, power: 0.8, inflict: { status: 'paralyze', chance: 0.25, turns: 1 }, verb: '舉盾猛撞' }],
    drops: [{ item: 'leatherArmor', chance: 0.08 }, { item: 'woodenShield', chance: 0.08 }],
    model: { kind: 'humanoid', skin: 0xbfb49a, cloth: 0x7a1f1f, metal: 0xb08d57, head: 'helm', weapon: 'sword', shield: true, scale: 1.05, bulk: 0.85, eye: 0xff4a4a, bony: true },
    flavor: '身披古代鎧甲的骷髏戰士。',
  },
  {
    key: 'skeletonAxeman', name: '骷髏斧手', rarity: 'common', levelOffset: 2, hpMul: 1, atkMul: 1.25, defMul: 1.1, xpMul: 1.15, goldMul: 1.1,
    moves: [strike('揮動戰斧'), { id: 'whirl', name: '旋風斧', weight: 2, power: 1.6, telegraph: '骷髏斧手將戰斧高舉過頭，骨節喀喀作響……', verb: '旋身揮出致命的旋風斧' }],
    drops: [{ item: 'greatAxe', chance: 0.05 }],
    model: { kind: 'humanoid', skin: 0xd2c9b0, cloth: 0x2c2c33, head: 'skull', weapon: 'axe', scale: 1.05, bulk: 0.8, eye: 0x6fd3ff, bony: true },
    flavor: '力大無窮的骷髏劊子手。',
  },
  // ───── 3F ─────
  {
    key: 'skeletonSpearman', name: '骷髏槍兵', rarity: 'uncommon', levelOffset: 1, hpMul: 1, atkMul: 1.15, defMul: 1.2, xpMul: 1.15, goldMul: 1.1,
    moves: [strike('挺槍直刺'), { id: 'pierce', name: '貫穿', weight: 2, power: 1.2, pierce: 0.5, verb: '長槍貫穿你的護甲' }],
    drops: [{ item: 'longSword', chance: 0.04 }, { item: 'ironHelm', chance: 0.03 }],
    model: { kind: 'humanoid', skin: 0xd8d0b8, cloth: 0x203040, metal: 0x8a8f99, head: 'helm', weapon: 'spear', scale: 1.05, bulk: 0.75, eye: 0x6fd3ff, bony: true },
    flavor: '槍法精準的亡者兵團。',
  },
  {
    key: 'shelob', name: '夏洛伯', rarity: 'uncommon', levelOffset: 1, hpMul: 1.1, atkMul: 1, defMul: 0.9, xpMul: 1.2, goldMul: 1,
    moves: [strike('以前肢刺擊', 4), { id: 'venom', name: '毒牙', weight: 3, power: 1, inflict: { status: 'poison', chance: 0.7, turns: 4 }, verb: '以滴著毒液的獠牙咬來' }],
    drops: [{ item: 'antidote', chance: 0.3 }, { item: 'orangePotion', chance: 0.15 }],
    model: { kind: 'spider', body: 0x2a2230, accent: 0x8a2b6a, scale: 0.9, eye: 0xff3a3a },
    flavor: '盤據石縫的巨型毒蜘蛛。',
  },
  {
    key: 'ghoul', name: '食屍鬼', rarity: 'uncommon', levelOffset: 2, hpMul: 1.15, atkMul: 1.1, defMul: 0.9, xpMul: 1.3, goldMul: 1.2,
    moves: [strike('以利爪撕扯'), { id: 'paralyzeClaw', name: '麻痺之爪', weight: 2, power: 0.9, inflict: { status: 'paralyze', chance: 0.45, turns: 1 }, cooldown: 3, verb: '以沾滿屍毒的爪子劃過' }],
    drops: [{ item: 'leatherHelm', chance: 0.08 }, { item: 'antidote', chance: 0.2 }, { item: 'chainmailPants', chance: 0.03 }],
    model: { kind: 'humanoid', skin: 0x8a9a8a, cloth: 0x2a2420, head: 'ghoul', weapon: 'claws', scale: 1, bulk: 0.8, eye: 0xb6ff3a, hunch: 0.45 },
    flavor: '以腐肉為食，爪子能使人麻痺。',
  },
  // ───── 4F ─────
  {
    key: 'ungoliant', name: '楊果里恩', rarity: 'uncommon', levelOffset: 1, hpMul: 1.25, atkMul: 1.1, defMul: 1, xpMul: 1.3, goldMul: 1.1,
    moves: [strike('揮動鋒利的步足', 4), { id: 'venom', name: '劇毒噴吐', weight: 3, power: 1.1, inflict: { status: 'poison', chance: 0.8, turns: 4 }, verb: '噴出一口劇毒' }],
    drops: [{ item: 'antidote', chance: 0.35 }, { item: 'elvenChainPants', chance: 0.02 }],
    model: { kind: 'spider', body: 0x14141c, accent: 0xd09a2a, scale: 1.15, eye: 0xffaa22 },
    flavor: '吞噬光芒的蜘蛛之母後裔。',
  },
  {
    key: 'ogre', name: '食人妖精', rarity: 'uncommon', levelOffset: 1, hpMul: 1.45, atkMul: 1.2, defMul: 1, xpMul: 1.4, goldMul: 1.3,
    moves: [strike('揮動巨大棍棒'), { id: 'smash', name: '重錘', weight: 2, power: 1.8, telegraph: '食人妖精雙手握棍高舉，肌肉暴起青筋……', verb: '用盡全力把棍棒砸下' }],
    drops: [{ item: 'greatAxe', chance: 0.05 }, { item: 'vineArmor', chance: 0.05 }, { item: 'orangePotion', chance: 0.3 }],
    model: { kind: 'humanoid', skin: 0x9a7a5a, cloth: 0x4a3420, head: 'orc', weapon: 'club', scale: 1.35, bulk: 1.5, eye: 0xffcc33, hunch: 0.2 },
    flavor: '力大無窮、愚笨兇暴的巨人。',
  },
  {
    key: 'stoneGolem', name: '石頭高崙', rarity: 'uncommon', levelOffset: 2, hpMul: 1.7, atkMul: 1.05, defMul: 2, xpMul: 1.5, goldMul: 1,
    moves: [strike('揮出岩石巨拳'), { id: 'quake', name: '震地', weight: 2, power: 1.5, accuracy: 0.1, telegraph: '石頭高崙的身軀開始發出低沉的轟鳴……', verb: '重踏地面引發震波' }],
    drops: [{ item: 'ironHelm', chance: 0.06 }, { item: 'scaleMail', chance: 0.02 }],
    model: { kind: 'golem', body: 0x6a6660, accent: 0x3a3630, scale: 1.3, eye: 0x4ac8ff },
    flavor: '魔法賦予生命的岩石守衛，極難擊碎。',
  },
  // ───── 5F ─────
  {
    key: 'cerberus', name: '地獄犬', rarity: 'rare', levelOffset: 1, hpMul: 1.2, atkMul: 1.3, defMul: 1, xpMul: 1.5, goldMul: 1.4,
    moves: [strike('撲上來撕咬'), { id: 'fireBreath', name: '地獄火吐息', weight: 2, power: 1.7, pierce: 0.3, cooldown: 3, telegraph: '地獄犬的三張嘴中竄出火光……', verb: '三首齊吐地獄烈焰' }],
    drops: [{ item: 'wizardStaff', chance: 0.03 }, { item: 'whitePotion', chance: 0.2 }],
    model: { kind: 'hound', body: 0x2a1a1a, accent: 0xff5a1a, heads: 3, scale: 1.1, eye: 0xffaa22 },
    flavor: '來自魔界的三頭犬。',
  },
  {
    key: 'floatingEye', name: '漂浮之眼', rarity: 'rare', levelOffset: 2, hpMul: 0.9, atkMul: 1.15, defMul: 0.8, xpMul: 1.45, goldMul: 1.3,
    moves: [{ id: 'gaze', name: '凝視', weight: 3, power: 1, pierce: 0.4, verb: '以詭異的目光灼燒你' }, { id: 'drain', name: '魔力吸取', weight: 2, power: 0.7, drainMp: 12, verb: '吸走你的魔力' }, { id: 'paralyzeGaze', name: '石化凝視', weight: 1, power: 0.4, inflict: { status: 'paralyze', chance: 0.5, turns: 1 }, cooldown: 4, verb: '瞪大瞳孔直視你的雙眼' }],
    drops: [{ item: 'bluePotion', chance: 0.4 }, { item: 'mageHat', chance: 0.06 }],
    model: { kind: 'eye', body: 0xc8b8a8, iris: 0xaa22ff, scale: 1 },
    flavor: '漂浮在半空的巨大眼球，能看穿人心。',
  },
  // ───── 6~7F ─────
  {
    key: 'ogreKing', name: '食人妖精王', rarity: 'rare', levelOffset: 2, hpMul: 1.6, atkMul: 1.3, defMul: 1.2, xpMul: 1.8, goldMul: 1.8,
    enrageAt: 0.4,
    moves: [strike('揮舞鑲鐵巨棍'), { id: 'smash', name: '王者重擊', weight: 2, power: 2, telegraph: '食人妖精王怒吼一聲，將巨棍舉向天花板……', verb: '把巨棍砸向你的頭頂' }],
    drops: [{ item: 'bravePotion', chance: 0.12 }, { item: 'twoHandedSword', chance: 0.03 }, { item: 'chainmailPants', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0x8a6a4a, cloth: 0x6a1a1a, metal: 0xc8a040, head: 'horned', weapon: 'club', scale: 1.55, bulk: 1.6, eye: 0xff5533, cape: 0x6a1a1a, hunch: 0.15 },
    flavor: '統領食人妖精的巨大君王。',
  },
  // ───── 首領 ─────
  {
    key: 'sima', name: '西瑪', rarity: 'legendary', boss: true, levelOffset: 0, hpMul: 2.7, atkMul: 1.25, defMul: 1.2, xpMul: 7, goldMul: 9,
    enrageAt: 0.5,
    moves: [strike('揮動法杖', 4), { id: 'iceLance', name: '冰矛術', weight: 3, power: 1.4, pierce: 0.4, verb: '召喚冰矛貫穿你' }, { id: 'blizzard', name: '暴風雪', weight: 2, power: 2.3, cooldown: 3, telegraph: '西瑪的身邊開始飄落冰晶，寒氣逼人……', verb: '釋放刺骨的暴風雪' }],
    drops: [{ item: 'elvenWafer', chance: 0.6 }, { item: 'wizardStaff', chance: 0.3 }, { item: 'ancientRobe', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0xd8c0b0, cloth: 0x2a4a8a, head: 'hood', weapon: 'staff', scale: 1.15, bulk: 0.9, eye: 0x7ad8ff, cape: 0x1a2a5a, aura: 0x4aa8ff },
    flavor: '墮落的冰系大法師。',
  },
  {
    key: 'balthazar', name: '巴土瑟', rarity: 'legendary', boss: true, levelOffset: 0, hpMul: 3.0, atkMul: 1.3, defMul: 1.5, xpMul: 7, goldMul: 9,
    enrageAt: 0.5,
    moves: [strike('揮動巨劍'), { id: 'earthSplit', name: '大地裂斬', weight: 2, power: 2.2, telegraph: '巴土瑟將巨劍插入地面，裂縫中滲出紅光……', verb: '掀起裂地斬擊' }],
    drops: [{ item: 'whitePotion', chance: 0.6 }, { item: 'mithrilDagger', chance: 0.25 }, { item: 'shieldOfAntharas', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0x6a4a3a, cloth: 0x3a2a1a, metal: 0x5a5a6a, head: 'horned', weapon: 'sword', shield: true, scale: 1.35, bulk: 1.4, eye: 0xff6a2a, cape: 0x4a1a0a, aura: 0xff6a2a },
    flavor: '身披重甲的魔族將軍。',
  },
  {
    key: 'casper', name: '卡士伯', rarity: 'legendary', boss: true, levelOffset: 0, hpMul: 2.6, atkMul: 1.3, defMul: 1.1, xpMul: 7, goldMul: 9,
    enrageAt: 0.5,
    moves: [strike('揮出暗影之爪', 4), { id: 'curse', name: '詛咒', weight: 2, power: 0.8, inflict: { status: 'poison', chance: 0.9, turns: 5 }, verb: '對你下了腐蝕詛咒' }, { id: 'soulReap', name: '靈魂收割', weight: 2, power: 2.4, cooldown: 3, telegraph: '卡士伯的鐮刀泛起幽綠的光芒……', verb: '揮下收割靈魂的鐮刀' }],
    drops: [{ item: 'elvenShield', chance: 0.3 }, { item: 'mageHat', chance: 0.2 }, { item: 'dragonicHelm', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0x9a9aa8, cloth: 0x1a1a24, head: 'hood', weapon: 'scythe', scale: 1.2, bulk: 0.85, eye: 0x6aff8a, cape: 0x10101a, aura: 0x4aff7a },
    flavor: '操弄死者靈魂的死靈術士。',
  },
  {
    key: 'markus', name: '馬庫爾', rarity: 'legendary', boss: true, levelOffset: 0, hpMul: 2.8, atkMul: 1.35, defMul: 1.3, xpMul: 7, goldMul: 9,
    enrageAt: 0.5,
    moves: [strike('雙劍連斬', 5), { id: 'bladeStorm', name: '劍刃風暴', weight: 2, power: 2.2, cooldown: 3, telegraph: '馬庫爾雙劍交叉，周身捲起旋風……', verb: '化身劍刃風暴席捲而來' }],
    drops: [{ item: 'mithrilDagger', chance: 0.3 }, { item: 'scaleMail', chance: 0.25 }, { item: 'shadowLeggings', chance: 0.06 }],
    model: { kind: 'humanoid', skin: 0xb89a7a, cloth: 0x5a1a4a, metal: 0x9aa0b0, head: 'helm', weapon: 'sword', scale: 1.25, bulk: 1.1, eye: 0xff3aaa, cape: 0x3a0a2a, aura: 0xff3aaa },
    flavor: '雙劍無雙的叛逆騎士。',
  },
  {
    key: 'deathKnight', name: '死亡騎士', rarity: 'legendary', boss: true, levelOffset: 0, hpMul: 3.2, atkMul: 1.4, defMul: 1.6, xpMul: 12, goldMul: 15,
    enrageAt: 0.5,
    moves: [
      strike('揮下烈炎之劍', 5),
      { id: 'hellfire', name: '地獄業火', weight: 2, power: 1.3, pierce: 0.6, verb: '召喚地獄業火焚燒你' },
      { id: 'deathBlade', name: '死亡斬', weight: 2, power: 2.6, cooldown: 3, telegraph: '死亡騎士的烈炎之劍燃起漆黑的火焰……這一擊非同小可！', verb: '斬出吞噬一切的死亡斬' },
    ],
    drops: [{ item: 'bravePotion', chance: 0.7 }, { item: 'flameSwordOfDeathKnight', chance: 0.15 }],
    model: { kind: 'humanoid', skin: 0x2a2a30, cloth: 0x1a0a0a, metal: 0x2a2a34, head: 'horned', weapon: 'flameSword', shield: false, scale: 1.45, bulk: 1.3, eye: 0xff3a1a, cape: 0x3a0a0a, aura: 0xff3a1a },
    flavor: '古魯丁地監最深處的不死之王。',
  },
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(list.map((m) => [m.key, m]));

export function getMonster(key: string): MonsterDef {
  const m = MONSTERS[key];
  if (!m) throw new Error(`Unknown monster: ${key}`);
  return m;
}
