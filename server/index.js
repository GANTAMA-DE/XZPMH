import cors from "cors";
import express from "express";
import { createServer } from "http";
import { randomUUID } from "node:crypto";
import { Server } from "socket.io";
import { ITEM_CATALOG } from "../shared/itemCatalog.js";

const PORT = Number(process.env.PORT || 3001);

const GRID_W = 10;
const GRID_H = 30;
const REVEAL_STEP_MS = 320;
const ACTION_PHASE_MS = 90000;
const NEXT_ROUND_PREPARE_MS = 5000;
const FORCE_NEXT_MS = 180000;

const ROLES = [
  { id: "r1", name: "刘一", avatar: "刘", skill: "按轮次揭示黄→圣级物品的品质。" },
  { id: "r2", name: "陈二", avatar: "陈", skill: "按轮次揭示黄→圣级物品的轮廓。" },
  { id: "r3", name: "张三", avatar: "张", skill: "每轮在未知品质中各揭示一件最高/最低品质物品的品质。" },
  { id: "r4", name: "李四", avatar: "李", skill: "每轮在未知信息中各揭示一件最高/最低品质物品的轮廓。" },
  { id: "r5", name: "王五", avatar: "王", skill: "按类型分轮揭示对应最高品质物品的品质。" },
  { id: "r6", name: "赵六", avatar: "赵", skill: "按类型分轮揭示对应物品的全部轮廓。" },
  { id: "r7", name: "孙七", avatar: "孙", skill: "按圣→黄顺序揭示对应品质物品的平均格数。" },
  { id: "r8", name: "周八", avatar: "周", skill: "按圣→黄顺序揭示对应品质物品的总格数。" },
  { id: "r9", name: "吴九", avatar: "吴", skill: "按轮次揭示不同品质组合的物品数量。" },
  { id: "r10", name: "郑十", avatar: "郑", skill: "按轮次揭示不同品质组合的物品均价。" },
  { id: "r11", name: "炼丹师", avatar: "丹", skill: "按轮次揭示丹药的数量、总格数、轮廓、品质与全部物品。" },
  { id: "r12", name: "炼器师", avatar: "器", skill: "按轮次揭示武器的数量、总格数、轮廓、品质与全部物品。" },
  { id: "r13", name: "阵法师", avatar: "阵", skill: "按轮次揭示阵法的数量、总格数、轮廓、品质与全部物品。" },
  { id: "r14", name: "符箓师", avatar: "符", skill: "按轮次揭示符箓的数量、总格数、轮廓、品质与全部物品。" },
  { id: "r15", name: "灵植师", avatar: "植", skill: "按轮次揭示灵植的数量、总格数、轮廓、品质与全部物品。" },
  { id: "r16", name: "灵兽师", avatar: "兽", skill: "按轮次揭示灵兽的数量、总格数、轮廓、品质与全部物品。" },
];

const HEXAGRAM_SHORT_BY_NAME = {
  坤为地: "坤",
  山地剥: "剥",
  水地比: "比",
  风地观: "观",
  雷地豫: "豫",
  火地晋: "晋",
  泽地萃: "萃",
  天地否: "否",
  地山谦: "谦",
  艮为山: "艮",
  水山蹇: "蹇",
  风山渐: "渐",
  雷山小过: "小过",
  火山旅: "旅",
  泽山咸: "咸",
  天山遁: "遁",
  地水师: "师",
  山水蒙: "蒙",
  坎为水: "坎",
  风水涣: "涣",
  雷水解: "解",
  火水未济: "未济",
  泽水困: "困",
  天水讼: "讼",
  地风升: "升",
  山风蛊: "蛊",
  水风井: "井",
  巽为风: "巽",
  雷风恒: "恒",
  火风鼎: "鼎",
  泽风大过: "大过",
  天风姤: "姤",
  地雷复: "复",
  山雷颐: "颐",
  水雷屯: "屯",
  风雷益: "益",
  震为雷: "震",
  火雷噬嗑: "噬嗑",
  泽雷随: "随",
  天雷无妄: "无妄",
  地火明夷: "明夷",
  山火贲: "贲",
  水火既济: "既济",
  风火家人: "家人",
  雷火丰: "丰",
  离为火: "离",
  泽火革: "革",
  天火同人: "同人",
  地泽临: "临",
  山泽损: "损",
  水泽节: "节",
  风泽中孚: "中孚",
  雷泽归妹: "归妹",
  火泽睽: "睽",
  兑为泽: "兑",
  天泽履: "履",
  地天泰: "泰",
  山天大畜: "大畜",
  水天需: "需",
  风天小畜: "小畜",
  雷天大壮: "大壮",
  火天大有: "大有",
  泽天夬: "夬",
  乾为天: "乾",
};

function createTool(id, name, cost, desc, effect) {
  return { id, name, short: HEXAGRAM_SHORT_BY_NAME[name] || name[0], cost, desc, effect };
}

const TOOLS = [
  // 物品类
  createTool("t01", "乾为天", 1000, "随机显示2个物品", { type: "revealItem", scope: { kind: "random", count: 2 } }),
  createTool("t02", "天地否", 2000, "随机显示4个物品", { type: "revealItem", scope: { kind: "random", count: 4 } }),
  createTool("t03", "天雷无妄", 5000, "随机显示6个物品", { type: "revealItem", scope: { kind: "random", count: 6 } }),
  createTool("t04", "天山遁", 10000, "随机显示8个物品", { type: "revealItem", scope: { kind: "random", count: 8 } }),
  createTool("t05", "天火同人", 20000, "随机显示10个物品", { type: "revealItem", scope: { kind: "random", count: 10 } }),
  createTool("t06", "天水讼", 100000, "显示所有物品", { type: "revealItem", scope: { kind: "all" } }),
  createTool("t07", "天泽履", 5000, "随机显示最大格子数中的1个物品", { type: "revealItem", scope: { kind: "maxSizeOne" } }),
  createTool("t08", "天风姤", 8000, "随机显示最高品质中的1个物品", { type: "revealItem", scope: { kind: "highestQualityOne" } }),

  // 总价类
  createTool("t09", "地天泰", 80000, "显示所有圣级物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "quality", qualities: ["圣"] } }),
  createTool("t10", "坤为地", 40000, "显示所有天级物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "quality", qualities: ["天"] } }),
  createTool("t11", "地雷复", 10000, "显示所有地级物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "quality", qualities: ["地"] } }),
  createTool("t12", "地山谦", 5000, "显示所有玄级物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "quality", qualities: ["玄"] } }),
  createTool("t13", "地火明夷", 2000, "显示所有黄级物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "quality", qualities: ["黄"] } }),
  createTool("t14", "地水师", 100000, "显示所有物品的总价", { type: "summary", metric: "totalPrice", scope: { kind: "all" } }),
  createTool("t15", "地泽临", 5000, "显示最大格子数的物品总价", { type: "summary", metric: "totalPrice", scope: { kind: "maxSizeAll" } }),
  createTool("t16", "地风升", 20000, "显示最高品质的物品总价", { type: "summary", metric: "totalPrice", scope: { kind: "highestQualityAll" } }),

  // 品质类
  createTool("t17", "雷天大壮", 500, "随机显示2个物品的品质", { type: "revealQuality", scope: { kind: "random", count: 2 } }),
  createTool("t18", "雷地豫", 1000, "随机显示4个物品的品质", { type: "revealQuality", scope: { kind: "random", count: 4 } }),
  createTool("t19", "震为雷", 2000, "随机显示6个物品的品质", { type: "revealQuality", scope: { kind: "random", count: 6 } }),
  createTool("t20", "雷山小过", 5000, "随机显示8个物品的品质", { type: "revealQuality", scope: { kind: "random", count: 8 } }),
  createTool("t21", "雷火丰", 10000, "随机显示10个物品的品质", { type: "revealQuality", scope: { kind: "random", count: 10 } }),
  createTool("t22", "雷水解", 60000, "显示所有物品的品质", { type: "revealQuality", scope: { kind: "all" } }),
  createTool("t23", "雷泽归妹", 800, "随机显示最大格子数中的1个物品的品质", { type: "revealQuality", scope: { kind: "maxSizeOne" } }),
  createTool("t24", "雷风恒", 2000, "随机显示最高品质中的1个物品的品质", { type: "revealQuality", scope: { kind: "highestQualityOne" } }),

  // 轮廓类
  createTool("t25", "山天大畜", 500, "随机显示2个物品的轮廓", { type: "revealContour", scope: { kind: "random", count: 2 } }),
  createTool("t26", "山地剥", 800, "随机显示4个物品的轮廓", { type: "revealContour", scope: { kind: "random", count: 4 } }),
  createTool("t27", "山雷颐", 1500, "随机显示6个物品的轮廓", { type: "revealContour", scope: { kind: "random", count: 6 } }),
  createTool("t28", "艮为山", 4000, "随机显示8个物品的轮廓", { type: "revealContour", scope: { kind: "random", count: 8 } }),
  createTool("t29", "山火贲", 8000, "随机显示10个物品的轮廓", { type: "revealContour", scope: { kind: "random", count: 10 } }),
  createTool("t30", "山水蒙", 30000, "显示所有物品的轮廓", { type: "revealContour", scope: { kind: "all" } }),
  createTool("t31", "山泽损", 800, "随机显示最大格子数中的1个物品的轮廓", { type: "revealContour", scope: { kind: "maxSizeOne" } }),
  createTool("t32", "山风蛊", 2000, "随机显示最高品质中的1个物品的轮廓", { type: "revealContour", scope: { kind: "highestQualityOne" } }),

  // 数量类
  createTool("t33", "火天大有", 50000, "显示所有圣级物品的数量", { type: "summary", metric: "count", scope: { kind: "quality", qualities: ["圣"] } }),
  createTool("t34", "火地晋", 10000, "显示所有天级物品的数量", { type: "summary", metric: "count", scope: { kind: "quality", qualities: ["天"] } }),
  createTool("t35", "火雷噬嗑", 5000, "显示所有地级物品的数量", { type: "summary", metric: "count", scope: { kind: "quality", qualities: ["地"] } }),
  createTool("t36", "火山旅", 2000, "显示所有玄级物品的数量", { type: "summary", metric: "count", scope: { kind: "quality", qualities: ["玄"] } }),
  createTool("t37", "离为火", 1000, "显示所有黄级物品的数量", { type: "summary", metric: "count", scope: { kind: "quality", qualities: ["黄"] } }),
  createTool("t38", "火水未济", 5000, "显示所有物品的数量", { type: "summary", metric: "count", scope: { kind: "all" } }),
  createTool("t39", "火泽睽", 500, "显示最大格子数的物品数量", { type: "summary", metric: "count", scope: { kind: "maxSizeAll" } }),
  createTool("t40", "火风鼎", 5000, "显示最高品质的物品数量", { type: "summary", metric: "count", scope: { kind: "highestQualityAll" } }),

  // 均价类
  createTool("t41", "水天需", 20000, "显示所有圣级物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "quality", qualities: ["圣"] } }),
  createTool("t42", "水地比", 8000, "显示所有天级物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "quality", qualities: ["天"] } }),
  createTool("t43", "水雷屯", 4000, "显示所有地级物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "quality", qualities: ["地"] } }),
  createTool("t44", "水山蹇", 1000, "显示所有玄级物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "quality", qualities: ["玄"] } }),
  createTool("t45", "水火既济", 500, "显示所有黄级物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "quality", qualities: ["黄"] } }),
  createTool("t46", "坎为水", 20000, "显示所有物品的均价", { type: "summary", metric: "avgPrice", scope: { kind: "all" } }),
  createTool("t47", "水泽节", 500, "显示最大格子数的物品均价", { type: "summary", metric: "avgPrice", scope: { kind: "maxSizeAll" } }),
  createTool("t48", "水风井", 5000, "显示最高品质的物品均价", { type: "summary", metric: "avgPrice", scope: { kind: "highestQualityAll" } }),

  // 总格数类
  createTool("t49", "泽天夬", 40000, "显示所有圣级物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "quality", qualities: ["圣"] } }),
  createTool("t50", "泽地萃", 8000, "显示所有天级物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "quality", qualities: ["天"] } }),
  createTool("t51", "泽雷随", 4000, "显示所有地级物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "quality", qualities: ["地"] } }),
  createTool("t52", "泽山咸", 1000, "显示所有玄级物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "quality", qualities: ["玄"] } }),
  createTool("t53", "泽火革", 500, "显示所有黄级物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "quality", qualities: ["黄"] } }),
  createTool("t54", "泽水困", 2000, "显示所有物品的总格数", { type: "summary", metric: "totalSize", scope: { kind: "all" } }),
  createTool("t55", "兑为泽", 500, "显示最大格子数的物品总格数", { type: "summary", metric: "totalSize", scope: { kind: "maxSizeAll" } }),
  createTool("t56", "泽风大过", 2000, "显示最高品质的物品总格数", { type: "summary", metric: "totalSize", scope: { kind: "highestQualityAll" } }),

  // 均格数类
  createTool("t57", "风天小畜", 10000, "显示所有圣级物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "quality", qualities: ["圣"] } }),
  createTool("t58", "风地观", 5000, "显示所有天级物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "quality", qualities: ["天"] } }),
  createTool("t59", "风雷益", 1000, "显示所有地级物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "quality", qualities: ["地"] } }),
  createTool("t60", "风山渐", 500, "显示所有玄级物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "quality", qualities: ["玄"] } }),
  createTool("t61", "风火家人", 500, "显示所有黄级物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "quality", qualities: ["黄"] } }),
  createTool("t62", "风水涣", 500, "显示所有物品的平均格数", { type: "summary", metric: "avgSize", scope: { kind: "all" } }),
  createTool("t63", "风泽中孚", 500, "显示最大格子数的物品平均格数", { type: "summary", metric: "avgSize", scope: { kind: "maxSizeAll" } }),
  createTool("t64", "巽为风", 1000, "显示最高品质的物品平均格数", { type: "summary", metric: "avgSize", scope: { kind: "highestQualityAll" } }),
];

const REALM_RANGE = {
  炼气: [10, 60],
  筑基: [20, 80],
  结丹: [30, 100],
  元婴: [40, 120],
  化神: [50, 150],
  炼虚: [60, 200],
  合体: [70, 250],
  大乘: [80, 300],
};

const DEFAULT_SETTINGS = {
  maxPlayers: 6,
  password: "",
  totalRounds: 10,
  hintRounds: [1, 3],
  multipliers: [2.0, 1.6, 1.4, 1.2, 1.0],
  initialSpiritStone: 500000,
  entryFee: 10000,
  profitShareRate: 0.35,
  lossRebateRate: 0.25,
  allowDuplicateRoles: true,
  realmProbability: {
    炼气: 5,
    筑基: 10,
    结丹: 15,
    元婴: 20,
    化神: 20,
    炼虚: 15,
    合体: 10,
    大乘: 5,
  },
};

const SHAPES = [
  { w: 1, h: 1, weight: 30 },
  { w: 1, h: 2, weight: 20 },
  { w: 2, h: 1, weight: 20 },
  { w: 2, h: 2, weight: 15 },
  { w: 2, h: 3, weight: 7 },
  { w: 3, h: 2, weight: 5 },
  { w: 3, h: 3, weight: 3 },
];

const rooms = new Map();
const playerTokenMap = new Map();

function hashSeed(input) {
  let h = 1779033703 ^ input.length;
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) + 1;
}

function createRng(seed) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(arr, rng) {
  const total = arr.reduce((acc, cur) => acc + cur.weight, 0);
  let roll = rng() * total;
  for (const item of arr) {
    roll -= item.weight;
    if (roll <= 0) return item.value;
  }
  return arr[arr.length - 1].value;
}

function randomRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function toolById(toolId) {
  return TOOLS.find((t) => t.id === toolId);
}

function roleById(roleId) {
  return ROLES.find((r) => r.id === roleId) || ROLES[0];
}

function nowText() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(
    d.getSeconds()
  ).padStart(2, "0")}`;
}


function createPlayer(name, token) {
  return {
    id: `p_${Math.random().toString(36).slice(2, 8)}`,
    token,
    name: name || "匿名修士",
    roleId: ROLES[0].id,
    ready: false,
    connected: true,
    managed: false,
    spiritStone: DEFAULT_SETTINGS.initialSpiritStone,
    stats: {
      wins: 0,
      usedTools: 0,
      totalProfit: 0,
      totalBids: 0,
      totalBidAmount: 0,
      roundsWon: 0,
      maxSingleProfit: 0,
      maxSingleLoss: 0,
      toolSpend: 0,
      entrySpend: 0,
      revealsFastForwarded: 0,
    },
    socketId: "",
  };
}

function clampMaxPlayers(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.maxPlayers;
  return Math.max(2, Math.min(16, Math.floor(n)));
}

function normalizeHintRounds(value, fallback = DEFAULT_SETTINGS.hintRounds) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5))].sort((a, b) => a - b);
}

function normalizeMultipliers(value, fallback = DEFAULT_SETTINGS.multipliers) {
  if (!Array.isArray(value)) return [...fallback];
  const parsed = value
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 5);
  if (parsed.length !== 5) return [...fallback];
  return parsed;
}

function getRoomRoleSelectionMap(room) {
  const map = {};
  room.players.forEach((player) => {
    if (!player.roleId) return;
    if (!map[player.roleId]) map[player.roleId] = [];
    map[player.roleId].push(player.id);
  });
  return map;
}

function canSelectRole(room, playerId, roleId) {
  if (!roleById(roleId)) return false;
  if (room.settings.allowDuplicateRoles) return true;
  return !room.players.some((p) => p.id !== playerId && p.roleId === roleId);
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item?.[key];
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function buildQualityTypeMatrix(items) {
  const qualities = ["圣", "天", "地", "玄", "黄", "凡"];
  const types = ["功法", "丹药", "武器", "阵法", "符箓", "灵植", "灵兽", "杂项"];
  const matrix = Object.fromEntries(qualities.map((quality) => [quality, Object.fromEntries(types.map((type) => [type, 0]))]));
  (items || []).forEach((item) => {
    if (matrix[item.quality] && matrix[item.quality][item.type] !== undefined) {
      matrix[item.quality][item.type] += 1;
    }
  });
  return matrix;
}

function createEmptyIntel() {
  return {
    knownItemIds: [],
    knownContours: [],
    knownQualityCells: [],
    knownQualityItemIds: [],
    knownTypeItemIds: [],
    texts: [],
  };
}

function chooseRealm(prob, rng) {
  const list = Object.keys(prob).map((realm) => ({ value: realm, weight: prob[realm] }));
  return pickWeighted(list, rng);
}

function generateTargetCells(realm, rng) {
  const [min, max] = REALM_RANGE[realm];
  const tail = Math.pow(rng(), 2.8);
  return min + Math.floor((max - min) * tail);
}

function canPlace(grid, x, y, w, h) {
  if (x + w > GRID_W || y + h > GRID_H) return false;
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      if (grid[y + dy][x + dx]) return false;
    }
  }
  return true;
}

function placeOnGrid(grid, itemId, x, y, w, h) {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      grid[y + dy][x + dx] = itemId;
    }
  }
}

const QUALITY_ORDER = ["凡", "黄", "玄", "地", "天", "圣"];

function itemQualityRank(item) {
  return QUALITY_ORDER.indexOf(item.quality);
}

function uniquePush(list, value) {
  if (!list.includes(value)) list.push(value);
}

function qualityCellsForItem(item) {
  const cells = [];
  for (let dy = 0; dy < item.height; dy += 1) {
    for (let dx = 0; dx < item.width; dx += 1) {
      cells.push({ x: item.x + dx, y: item.y + dy, quality: item.quality, itemPlacedId: item.placedId });
    }
  }
  return cells;
}

function revealItemQuality(intel, item, rng = Math.random) {
  const cells = qualityCellsForItem(item);
  if (!cells.length) return;
  const pick = cells[Math.floor(rng() * cells.length)] || cells[0];
  if (!intel.knownQualityCells.some((c) => c.x === pick.x && c.y === pick.y && c.itemPlacedId === pick.itemPlacedId)) {
    intel.knownQualityCells.push(pick);
  }
  uniquePush(intel.knownQualityItemIds, item.placedId);
}

function revealItemContour(intel, item) {
  uniquePush(intel.knownContours, item.placedId);
}

function revealItemFull(intel, item) {
  uniquePush(intel.knownItemIds, item.placedId);
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

function revealItemType(intel, item) {
  uniquePush(intel.knownTypeItemIds, item.placedId);
}

function describeScope(scope) {
  if (!scope || scope.kind === "all") return "所有物品";
  if (scope.kind === "quality") {
    const qualities = scope.qualities || [];
    return qualities.length === 1 ? `所有${qualities[0]}级物品` : `${qualities.join("、")}级物品`;
  }
  if (scope.kind === "type") {
    const types = scope.types || [];
    return types.length === 1 ? `所有${types[0]}物品` : `${types.join("、")}物品`;
  }
  if (scope.kind === "highestQualityAll") return "最高品质物品";
  if (scope.kind === "highestQualityOne") return "最高品质中的1个物品";
  if (scope.kind === "maxSizeAll") return "最大格子数物品";
  if (scope.kind === "maxSizeOne") return "最大格子数中的1个物品";
  if (scope.kind === "random") return `随机${scope.count || 0}件物品`;
  return "目标物品";
}

function getUnknownQualityItems(intel, items) {
  const knownIds = new Set([...(intel.knownQualityItemIds || []), ...intel.knownItemIds]);
  return items.filter((item) => !knownIds.has(item.placedId));
}

function getUnknownContourItems(intel, items) {
  const knownIds = new Set([...intel.knownContours, ...intel.knownItemIds]);
  return items.filter((item) => !knownIds.has(item.placedId));
}

function filterByQualities(items, qualities) {
  return items.filter((item) => qualities.includes(item.quality));
}

function filterByTypes(items, itemTypes) {
  return items.filter((item) => itemTypes.includes(item.type));
}

function formatAvg(value) {
  return (Math.floor(value * 100) / 100).toFixed(2);
}

function pickRandom(list, rng) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)] || list[0] || null;
}

function pickHighestQualityRandom(items, rng) {
  if (!items.length) return null;
  const maxRank = Math.max(...items.map(itemQualityRank));
  const pool = items.filter((item) => itemQualityRank(item) === maxRank);
  return pickRandom(pool, rng);
}

function pickLowestQualityRandom(items, rng) {
  if (!items.length) return null;
  const minRank = Math.min(...items.map(itemQualityRank));
  const pool = items.filter((item) => itemQualityRank(item) === minRank);
  return pickRandom(pool, rng);
}

function summaryText(prefix, items, mode) {
  if (!items.length) {
    if (mode === "avgSize") return `${prefix}平均格数 = 0.00`;
    if (mode === "avgPrice") return `${prefix}均价 = 0.00`;
    return `${prefix}${mode === "count" ? "数量" : mode === "totalSize" ? "总格数" : "结果"} = 0`;
  }
  if (mode === "count") return `${prefix}数量 = ${items.length}`;
  if (mode === "totalSize") return `${prefix}总格数 = ${items.reduce((acc, cur) => acc + cur.size, 0)}`;
  if (mode === "avgSize") return `${prefix}平均格数 = ${formatAvg(items.reduce((acc, cur) => acc + cur.size, 0) / items.length)}`;
  if (mode === "avgPrice") return `${prefix}均价 = ${formatAvg(items.reduce((acc, cur) => acc + cur.price, 0) / items.length)}`;
  return `${prefix}总价 = ${items.reduce((acc, cur) => acc + cur.price, 0)}`;
}

function applyRoleSkill(room, round, player, bidRound, gameId) {
  const intel = round.intelByPlayer[player.id];
  const skillLog = round.skillHints[player.id];
  const items = round.placedItems;
  const role = roleById(player.roleId);
  if (!intel || !skillLog || !role) return;

  const rng = createRng(hashSeed(`${gameId}_${round.id}_${player.id}_skill_${bidRound}`));
  const qAsc = ["黄", "玄", "地", "天", "圣"];
  const qDesc = ["圣", "天", "地", "玄", "黄"];
  const typeRounds = [
    ["功法"],
    ["丹药", "武器"],
    ["阵法", "符箓"],
    ["灵植", "灵兽"],
    ["杂项"],
  ];
  const roleName = role.name;

  const push = (text) => {
    skillLog.push(text);
    intel.texts.push(text);
  };

  if (roleName === "刘一") {
    const quality = qAsc[bidRound - 1];
    const list = items.filter((item) => item.quality === quality);
    list.forEach((item) => revealItemQuality(intel, item, rng));
    push(`技能提示：刘一显露所有${quality}级物品的品质（共${list.length}件）。`);
    return;
  }

  if (roleName === "陈二") {
    const quality = qAsc[bidRound - 1];
    const list = items.filter((item) => item.quality === quality);
    list.forEach((item) => revealItemContour(intel, item));
    push(`技能提示：陈二显露所有${quality}级物品的轮廓（共${list.length}件）。`);
    return;
  }

  if (roleName === "张三") {
    const unknown = getUnknownQualityItems(intel, items);
    const high = pickHighestQualityRandom(unknown, rng);
    const low = pickLowestQualityRandom(unknown.filter((item) => item.placedId !== high?.placedId), rng);
    const shown = [];
    if (high) {
      revealItemQuality(intel, high, rng);
      shown.push(`最高品质之一（${high.quality}）`);
    }
    if (low) {
      revealItemQuality(intel, low, rng);
      shown.push(`最低品质之一（${low.quality}）`);
    }
    push(`技能提示：张三揭示剩余未知品质中的${shown.join("；") || "0件物品品质"}。`);
    return;
  }

  if (roleName === "李四") {
    const unknown = getUnknownContourItems(intel, items);
    const high = pickHighestQualityRandom(unknown, rng);
    const low = pickLowestQualityRandom(unknown.filter((item) => item.placedId !== high?.placedId), rng);
    const shown = [];
    if (high) {
      revealItemContour(intel, high);
      shown.push(`最高品质之一的轮廓（${high.shape}）`);
    }
    if (low) {
      revealItemContour(intel, low);
      shown.push(`最低品质之一的轮廓（${low.shape}）`);
    }
    push(`技能提示：李四揭示剩余未知轮廓中的${shown.join("；") || "0件物品轮廓"}。`);
    return;
  }

  if (roleName === "王五") {
    const types = typeRounds[bidRound - 1] || [];
    const shown = [];
    types.forEach((type) => {
      const top = pickHighestQualityRandom(filterByTypes(items, [type]), rng);
      if (top) {
        revealItemQuality(intel, top, rng);
        shown.push(`${type}最高品质之一（${top.quality}）`);
      }
    });
    push(`技能提示：王五揭示${shown.join("；") || "对应类型暂无物品"}的品质。`);
    return;
  }

  if (roleName === "赵六") {
    const types = typeRounds[bidRound - 1] || [];
    const list = filterByTypes(items, types);
    list.forEach((item) => revealItemContour(intel, item));
    push(`技能提示：赵六显露${types.join("、")}物品的轮廓（共${list.length}件）。`);
    return;
  }

  if (roleName === "孙七") {
    const quality = qDesc[bidRound - 1];
    const list = filterByQualities(items, [quality]);
    push(`技能提示：孙七得知所有${quality}级物品的平均格数 = ${list.length ? formatAvg(list.reduce((a, b) => a + b.size, 0) / list.length) : "0.00"}。`);
    return;
  }

  if (roleName === "周八") {
    const quality = qDesc[bidRound - 1];
    const list = filterByQualities(items, [quality]);
    push(`技能提示：周八得知所有${quality}级物品的总格数 = ${list.reduce((a, b) => a + b.size, 0)}。`);
    return;
  }

  if (roleName === "吴九") {
    const qualitySets = [["凡"], ["玄", "黄"], ["天", "地"], ["圣"], QUALITY_ORDER];
    const qualities = qualitySets[bidRound - 1] || [];
    const list = filterByQualities(items, qualities);
    push(`技能提示：吴九得知${qualities.join("、")}级物品的数量 = ${list.length}。`);
    return;
  }

  if (roleName === "郑十") {
    const qualitySets = [["凡"], ["玄", "黄"], ["天", "地"], ["圣"], QUALITY_ORDER];
    const qualities = qualitySets[bidRound - 1] || [];
    const list = filterByQualities(items, qualities);
    push(`技能提示：郑十得知${qualities.join("、")}级物品的均价 = ${list.length ? formatAvg(list.reduce((a, b) => a + b.price, 0) / list.length) : "0.00"}。`);
    return;
  }

  const professionMap = {
    炼丹师: "丹药",
    炼器师: "武器",
    阵法师: "阵法",
    符箓师: "符箓",
    灵植师: "灵植",
    灵兽师: "灵兽",
  };

  const boundType = professionMap[roleName];
  if (boundType) {
    const list = items.filter((item) => item.type === boundType);
    if (bidRound === 1) {
      push(`技能提示：${roleName}得知所有${boundType}物品的数量 = ${list.length}。`);
      return;
    }
    if (bidRound === 2) {
      push(`技能提示：${roleName}得知所有${boundType}物品的总格数 = ${list.reduce((a, b) => a + b.size, 0)}。`);
      return;
    }
    if (bidRound === 3) {
      list.forEach((item) => {
        revealItemContour(intel, item);
        revealItemType(intel, item);
      });
      push(`技能提示：${roleName}显露所有${boundType}物品的轮廓（共${list.length}件）。`);
      return;
    }
    if (bidRound === 4) {
      list.forEach((item) => {
        revealItemQuality(intel, item, rng);
        revealItemType(intel, item);
      });
      push(`技能提示：${roleName}显露所有${boundType}物品的品质（共${list.length}件）。`);
      return;
    }
    if (bidRound === 5) {
      list.forEach((item) => revealItemFull(intel, item));
      push(`技能提示：${roleName}显露所有${boundType}物品（共${list.length}件）。`);
      return;
    }
  }
}

function triggerRoundStartSkills(room, round, bidRound, gameId) {
  room.players.forEach((player) => {
    if (!round.intelByPlayer[player.id]) return;
    applyRoleSkill(room, round, player, bidRound, gameId);
  });
}

function selectItemsByScope(items, scope, rng) {
  if (!scope || scope.kind === "all") return [...items];
  if (scope.kind === "random") {
    return [...items].sort(() => rng() - 0.5).slice(0, Math.min(scope.count || 0, items.length));
  }
  if (scope.kind === "quality") {
    return items.filter((item) => (scope.qualities || []).includes(item.quality));
  }
  if (scope.kind === "type") {
    return items.filter((item) => (scope.types || []).includes(item.type));
  }
  if (scope.kind === "highestQualityAll" || scope.kind === "highestQualityOne") {
    const maxRank = Math.max(...items.map(itemQualityRank));
    const pool = items.filter((item) => itemQualityRank(item) === maxRank);
    return scope.kind === "highestQualityOne" ? (pool.length ? [pickRandom(pool, rng)] : []) : pool;
  }
  if (scope.kind === "maxSizeAll" || scope.kind === "maxSizeOne") {
    const maxSize = Math.max(...items.map((item) => item.size));
    const pool = items.filter((item) => item.size === maxSize);
    return scope.kind === "maxSizeOne" ? (pool.length ? [pickRandom(pool, rng)] : []) : pool;
  }
  return [...items];
}

function metricLabel(metric) {
  if (metric === "count") return "数量";
  if (metric === "totalPrice") return "总价";
  if (metric === "avgPrice") return "均价";
  if (metric === "totalSize") return "总格数";
  if (metric === "avgSize") return "平均格数";
  return "结果";
}

function computeMetric(items, metric) {
  if (!items.length) {
    return metric === "avgPrice" || metric === "avgSize" ? "0.00" : "0";
  }
  if (metric === "count") return String(items.length);
  if (metric === "totalPrice") return String(items.reduce((sum, item) => sum + item.price, 0));
  if (metric === "avgPrice") return formatAvg(items.reduce((sum, item) => sum + item.price, 0) / items.length);
  if (metric === "totalSize") return String(items.reduce((sum, item) => sum + item.size, 0));
  if (metric === "avgSize") return formatAvg(items.reduce((sum, item) => sum + item.size, 0) / items.length);
  return "0";
}

function applyHint(effect, intel, round, rng, source) {
  const items = round.placedItems;
  const targetItems = selectItemsByScope(items, effect.scope, rng).filter(Boolean);
  const scopeLabel = describeScope(effect.scope);

  if (effect.scope?.kind === "type") {
    targetItems.forEach((item) => revealItemType(intel, item));
  }

  if (effect.type === "revealItem") {
    targetItems.forEach((item) => revealItemFull(intel, item));
    return `${source}提示：显露${scopeLabel}。`;
  }

  if (effect.type === "revealQuality") {
    targetItems.forEach((item) => revealItemQuality(intel, item, rng));
    return `${source}提示：显露${scopeLabel}的品质。`;
  }

  if (effect.type === "revealContour") {
    targetItems.forEach((item) => revealItemContour(intel, item));
    return `${source}提示：显露${scopeLabel}的轮廓。`;
  }

  if (effect.type === "summary") {
    const value = computeMetric(targetItems, effect.metric);
    return `${source}提示：${scopeLabel}${metricLabel(effect.metric)} = ${value}`;
  }

  return `${source}提示：暂无结果。`;
}

function applySystemHintIfNeeded(room, round, gameId) {
  if (!room.settings.hintRounds.includes(round.auction.bidRound)) return;
  const seed = hashSeed(`${gameId}_${round.id}_hint_${round.auction.bidRound}`);
  const pickerRng = createRng(seed);
  const effect = TOOLS[Math.floor(pickerRng() * TOOLS.length)]?.effect || { type: "summary", metric: "totalSize", scope: { kind: "all" } };

  const previewIntel = createEmptyIntel();
  const previewText = applyHint(effect, previewIntel, round, createRng(seed), "系统");
  round.systemHints.push(previewText);

  room.players.forEach((p) => {
    const text = applyHint(effect, round.intelByPlayer[p.id], round, createRng(seed), "系统");
    round.intelByPlayer[p.id].texts.push(text);
  });
}

function createRound(room, gameId, roundNo) {
  const seed = hashSeed(`${gameId}_round_${roundNo}`);
  const rng = createRng(seed);
  const realm = chooseRealm(room.settings.realmProbability, rng);
  const target = generateTargetCells(realm, rng);
  const grid = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => null));
  const placedItems = [];
  let usedCells = 0;
  let guard = 0;

  while (usedCells < target && guard < 3000) {
    guard += 1;
    const remain = target - usedCells;

    let firstEmpty = null;
    for (let y = 0; y < GRID_H && !firstEmpty; y += 1) {
      for (let x = 0; x < GRID_W; x += 1) {
        if (!grid[y][x]) {
          firstEmpty = { x, y };
          break;
        }
      }
    }
    if (!firstEmpty) break;

    const fitCandidates = ITEM_CATALOG.filter((item) => {
      if (item.size > remain) return false;
      return canPlace(grid, firstEmpty.x, firstEmpty.y, item.width, item.height);
    });

    if (!fitCandidates.length) {
      let filled = false;
      const singles = ITEM_CATALOG.filter((item) => item.width === 1 && item.height === 1 && item.size <= remain);
      if (singles.length && canPlace(grid, firstEmpty.x, firstEmpty.y, 1, 1)) {
        const picked = singles[Math.floor(rng() * singles.length)];
        const placedId = `ri_${roundNo}_${placedItems.length}_${picked.id}`;
        placeOnGrid(grid, placedId, firstEmpty.x, firstEmpty.y, 1, 1);
        placedItems.push({ ...picked, placedId, x: firstEmpty.x, y: firstEmpty.y });
        usedCells += picked.size;
        filled = true;
      }
      if (!filled) {
        break;
      }
      continue;
    }

    const weighted = fitCandidates.map((item) => {
      const smallBonus = 1 / Math.max(1, item.size);
      const exactFitBonus = item.size === remain ? 2.4 : 1;
      const shortEdgeBonus = item.width <= 2 || item.height <= 2 ? 1.25 : 1;
      return { item, weight: (smallBonus * 10 + shortEdgeBonus) * exactFitBonus };
    });
    const picked = pickWeighted(weighted.map((w) => ({ value: w.item, weight: w.weight })), rng);
    const placedId = `ri_${roundNo}_${placedItems.length}_${picked.id}`;
    placeOnGrid(grid, placedId, firstEmpty.x, firstEmpty.y, picked.width, picked.height);
    placedItems.push({ ...picked, placedId, x: firstEmpty.x, y: firstEmpty.y });
    usedCells += picked.size;
  }

  const intelByPlayer = {};
  const skillHints = {};
  const toolHints = {};
  room.players.forEach((p) => {
    intelByPlayer[p.id] = createEmptyIntel();
    skillHints[p.id] = [];
    toolHints[p.id] = [];
  });

  const round = {
    id: `${gameId}_R${roundNo}`,
    roundNo,
    realm,
    targetCells: usedCells,
    placedItems,
    intelByPlayer,
    skillHints,
    toolHints,
    systemHints: [],
    settlement: null,
    auction: {
      bidRound: 1,
      phase: "行动中",
      deadlineAt: Date.now() + ACTION_PHASE_MS,
      activePlayerIds: room.players.filter((p) => !isBankrupt(p)).map((p) => p.id),
      submittedIds: [],
      bids: {},
      usedTools: {},
      statusByPlayer: {},
      usedToolHistoryByPlayer: {},
      logs: [],
      winnerId: null,
    },
  };

  applySystemHintIfNeeded(room, round, gameId);
  triggerRoundStartSkills(room, round, 1, gameId);
  return round;
}

function getCurrentRound(room) {
  if (!room.game) return null;
  return room.game.rounds[room.game.currentRound - 1] || null;
}

function isBankrupt(player) {
  return (player?.spiritStone ?? 0) < 0;
}

function autoSubmitManaged(room, round) {
  round.auction.activePlayerIds.forEach((pid) => {
    const player = room.players.find((p) => p.id === pid);
    if (!player) return;
    if (!round.auction.submittedIds.includes(pid) && (!player.connected || player.managed || isBankrupt(player))) {
      round.auction.submittedIds.push(pid);
      round.auction.bids[pid] = null;
      if (isBankrupt(player)) {
        round.auction.statusByPlayer = {
          ...(round.auction.statusByPlayer || {}),
          [pid]: "破产",
        };
      } else if (!player.connected || player.managed) {
        round.auction.statusByPlayer = {
          ...(round.auction.statusByPlayer || {}),
          [pid]: "离线",
        };
      }
    }
  });
}

function allActivePlayersCannotAct(room, round) {
  if (!round?.auction?.activePlayerIds?.length) return false;
  return round.auction.activePlayerIds.every((pid) => {
    const player = room.players.find((p) => p.id === pid);
    return !player || !player.connected || player.managed || isBankrupt(player);
  });
}

function createSettlementViewers(room, revealOrder) {
  const viewers = {};
  const now = Date.now();
  room.players.forEach((player) => {
    const offlineReady = !player.connected || player.managed;
    viewers[player.id] = {
      mode: "delay",
      revealIndex: offlineReady ? revealOrder.length : 0,
      nextRevealAt: offlineReady ? null : now + REVEAL_STEP_MS,
      completed: offlineReady,
      readyForNextRound: offlineReady,
      chosenAt: now,
      autoReadyAt: now + FORCE_NEXT_MS,
    };
  });
  return viewers;
}

function settleRound(room, round, winnerId, winningBid) {
  const totalValue = round.placedItems.reduce((acc, cur) => acc + cur.price, 0);
  const entryFee = room.settings.entryFee;
  room.players.forEach((p) => {
    p.spiritStone -= entryFee;
    p.stats.entrySpend += entryFee;
  });

  const sharing = {};
  let profit = 0;

  if (winnerId) {
    const winner = room.players.find((p) => p.id === winnerId);
    if (winner) {
      profit = totalValue - winningBid;
      winner.spiritStone += profit;
      winner.stats.wins += 1;
      winner.stats.roundsWon += 1;
      winner.stats.totalProfit += profit;
      winner.stats.maxSingleProfit = Math.max(winner.stats.maxSingleProfit, profit);
      winner.stats.maxSingleLoss = Math.min(winner.stats.maxSingleLoss, profit);

      const others = room.players.filter((p) => p.id !== winnerId);
      if (others.length > 0 && profit > 0) {
        const totalShare = Math.floor(profit * room.settings.profitShareRate);
        const each = Math.floor(totalShare / others.length);
        others.forEach((p) => {
          sharing[p.id] = -each;
        });
        sharing[winnerId] = each * others.length;
      }
      if (others.length > 0 && profit < 0) {
        const totalRebate = Math.floor(Math.abs(profit) * room.settings.lossRebateRate);
        const each = Math.floor(totalRebate / others.length);
        others.forEach((p) => {
          sharing[p.id] = each;
        });
        sharing[winnerId] = -each * others.length;
      }
    }
  }

  const revealOrder = [...round.placedItems].sort((a, b) => a.y - b.y || a.x - b.x || a.size - b.size);
  room.players.forEach((p) => {
    const bidLogs = round.auction.logs.map((log) => ({
      bidRound: log.roundNo,
      bid: log.bids?.[p.id] ?? null,
      usedToolId: log.usedTools?.[p.id] || null,
      success: log.winnerId === p.id,
    }));
    p.stats.totalBids += bidLogs.filter((x) => x.bid !== null && x.bid !== undefined).length;
    p.stats.totalBidAmount += bidLogs.reduce((sum, x) => sum + (typeof x.bid === "number" ? x.bid : 0), 0);
  });

  round.auction.phase = "回合结算";
  round.auction.winnerId = winnerId;
  round.settlement = {
    winnerId,
    winningBid,
    totalValue,
    profit,
    entryFee,
    sharing,
    revealOrder,
    startedAt: Date.now(),
    readyOpenAt: Date.now() + FORCE_NEXT_MS,
    allReadyCountdownAt: null,
    forceNextAt: Date.now() + FORCE_NEXT_MS,
    viewers: createSettlementViewers(room, revealOrder),
  };
}

function processRound(room) {
  const round = getCurrentRound(room);
  if (!round || round.auction.phase !== "行动中") return;
  autoSubmitManaged(room, round);
  if (allActivePlayersCannotAct(room, round)) {
    round.auction.activePlayerIds.forEach((pid) => {
      if (!round.auction.submittedIds.includes(pid)) {
        round.auction.submittedIds.push(pid);
        round.auction.bids[pid] = null;
      }
    });
  }
  if (round.auction.submittedIds.length < round.auction.activePlayerIds.length) return;

  const active = [...round.auction.activePlayerIds];
  const sorted = active
    .map((playerId) => ({ playerId, bid: round.auction.bids[playerId] ?? null }))
    .sort((a, b) => (b.bid ?? -1) - (a.bid ?? -1));

  const log = {
    roundNo: round.auction.bidRound,
    bids: { ...round.auction.bids },
    usedTools: { ...round.auction.usedTools },
    statusByPlayer: { ...(round.auction.statusByPlayer || {}) },
    sorted,
    success: false,
    winnerId: null,
    multiplier: room.settings.multipliers[Math.min(round.auction.bidRound, 5) - 1] || 1,
  };

  const topBid = sorted[0]?.bid ?? -1;
  const secondBid = sorted[1]?.bid ?? -1;
  const topPlayer = sorted[0]?.playerId || null;

  let success = false;
  let winnerId = null;

  if (active.length === 1 && topBid >= 0) {
    success = true;
    winnerId = topPlayer;
  } else if (round.auction.bidRound <= 4) {
    const ratio = room.settings.multipliers[round.auction.bidRound - 1] || 1;
    success = topBid >= 0 && topBid > secondBid * ratio;
    winnerId = success ? topPlayer : null;
  } else {
    success = topBid >= 0 && topBid > secondBid;
    winnerId = success ? topPlayer : null;
  }

  log.success = success;
  log.winnerId = winnerId;
  round.auction.logs.push(log);

  if (success) {
    settleRound(room, round, winnerId, topBid);
    return;
  }

  if (round.auction.bidRound < 5) {
    round.auction.bidRound += 1;
    round.auction.deadlineAt = Date.now() + ACTION_PHASE_MS;
    round.auction.activePlayerIds = round.auction.activePlayerIds.filter((pid) => {
      const player = room.players.find((p) => p.id === pid);
      return player && !isBankrupt(player);
    });
    round.auction.submittedIds = [];
    round.auction.bids = {};
    round.auction.usedTools = {};
    round.auction.statusByPlayer = {};
    applySystemHintIfNeeded(room, round, room.game.seedId || room.game.id);
    triggerRoundStartSkills(room, round, round.auction.bidRound, room.game.seedId || room.game.id);
    return;
  }

  const tieIds = sorted.filter((entry) => entry.bid === topBid && topBid >= 0).map((entry) => entry.playerId);
  if (tieIds.length >= 2) {
    round.auction.bidRound += 1;
    round.auction.deadlineAt = Date.now() + ACTION_PHASE_MS;
    round.auction.activePlayerIds = tieIds;
    round.auction.submittedIds = [];
    round.auction.bids = {};
    round.auction.usedTools = {};
    round.auction.statusByPlayer = {};
    return;
  }

  settleRound(room, round, null, 0);
}

function startGame(room) {
  const gameSeedId = `seed_${Math.random().toString(36).slice(2, 10)}`;
  room.players.forEach((p) => {
    p.spiritStone = room.settings.initialSpiritStone;
    p.stats = {
      wins: 0,
      usedTools: 0,
      totalProfit: 0,
      totalBids: 0,
      totalBidAmount: 0,
      roundsWon: 0,
      maxSingleProfit: 0,
      maxSingleLoss: 0,
      toolSpend: 0,
      entrySpend: 0,
      revealsFastForwarded: 0,
    };
  });

  room.game = {
    id: room.id,
    seedId: gameSeedId,
    status: "进行中",
    currentRound: 1,
    totalRounds: room.settings.totalRounds,
    rounds: [createRound(room, gameSeedId, 1)],
  };
  room.latestResult = null;
  room.phase = "游戏中";
}

const RESULT_TITLE_ORDER = [
  "冠",
  "亚",
  "季",
  "魁",
  "尾",
  "破",
  "富",
  "豪",
  "阔",
  "宝",
  "省",
  "龙",
  "凤",
  "神",
  "鬼",
  "牛",
  "熊",
  "虎",
  "龟",
  "鼠",
  "智",
  "亏",
  "秀",
  "吉",
  "凶",
  "衰",
  "福",
  "寿",
  "禄",
  "财",
  "喜",
  "功",
  "丹",
  "器",
  "阵",
  "符",
  "植",
  "兽",
  "杂",
  "圣",
  "天",
  "地",
  "玄",
  "黄",
  "凡",
];

const RESULT_TITLE_META = {
  冠: { name: "冠军", desc: "本局排名第一的玩家" },
  亚: { name: "亚军", desc: "本局排名第二的玩家" },
  季: { name: "季军", desc: "本局排名第三的玩家" },
  魁: { name: "魁首", desc: "每回合结算后排名第一次数最多的玩家" },
  尾: { name: "垫底", desc: "本局排名倒数第一的玩家" },
  破: { name: "破产", desc: "本局结束时灵石数小于 0 的玩家" },
  富: { name: "首富", desc: "游戏过程中灵石曾达到全场最高金额的玩家" },
  豪: { name: "豪掷", desc: "所有轮次中单次出价最高的玩家" },
  阔: { name: "阔绰", desc: "所有回合中竞价成功所花费灵石总和最多的玩家" },
  宝: { name: "宝卦", desc: "使用推演轮次数最多的玩家" },
  省: { name: "省卦", desc: "使用推演轮次数最少的玩家" },
  龙: { name: "龙夺", desc: "竞价成功回合数最多的玩家" },
  凤: { name: "凤随", desc: "竞价成功回合中作为出价第二名次数最多的玩家" },
  神: { name: "神算", desc: "竞价成功且累计盈利金额最多的玩家" },
  鬼: { name: "鬼手", desc: "竞价成功但累计亏损金额最多的玩家" },
  牛: { name: "牛市", desc: "竞价成功且盈利回合数最多的玩家" },
  熊: { name: "熊市", desc: "竞价成功但亏损回合数最多的玩家" },
  虎: { name: "虎投", desc: "所有轮次中竞价给出的灵石总和最多的玩家" },
  龟: { name: "龟投", desc: "所有轮次中竞价给出的灵石总和最少的玩家" },
  鼠: { name: "鼠尾", desc: "所有轮次中竞价垫底次数最多的玩家" },
  智: { name: "智夺", desc: "竞价成功且与第二名差额最少的一次所属玩家" },
  亏: { name: "亏天", desc: "竞价成功且与第二名差额最多的一次所属玩家" },
  秀: { name: "秀盈", desc: "竞价成功且单次盈利最多的一次所属玩家" },
  吉: { name: "吉盈", desc: "竞价成功且单次盈利最少的一次所属玩家" },
  凶: { name: "凶亏", desc: "竞价成功且单次亏损最少的一次所属玩家" },
  衰: { name: "衰亏", desc: "竞价成功且单次亏损最多的一次所属玩家" },
  福: { name: "福", desc: "曾在第六轮竞价成功的玩家" },
  寿: { name: "寿", desc: "曾在第七轮竞价成功的玩家" },
  禄: { name: "禄", desc: "曾在第八轮竞价成功的玩家" },
  财: { name: "财", desc: "曾在第九轮竞价成功的玩家" },
  喜: { name: "喜", desc: "曾在第十轮竞价成功的玩家" },
  功: { name: "功", desc: "竞拍成功获得功法类物品数最多的玩家" },
  丹: { name: "丹", desc: "竞拍成功获得丹药类物品数最多的玩家" },
  器: { name: "器", desc: "竞拍成功获得武器类物品数最多的玩家" },
  阵: { name: "阵", desc: "竞拍成功获得阵法类物品数最多的玩家" },
  符: { name: "符", desc: "竞拍成功获得符箓类物品数最多的玩家" },
  植: { name: "植", desc: "竞拍成功获得灵植类物品数最多的玩家" },
  兽: { name: "兽", desc: "竞拍成功获得灵兽类物品数最多的玩家" },
  杂: { name: "杂", desc: "竞拍成功获得杂项类物品数最多的玩家" },
  圣: { name: "圣", desc: "竞拍成功获得圣级物品数最多的玩家" },
  天: { name: "天", desc: "竞拍成功获得天级物品数最多的玩家" },
  地: { name: "地", desc: "竞拍成功获得地级物品数最多的玩家" },
  玄: { name: "玄", desc: "竞拍成功获得玄级物品数最多的玩家" },
  黄: { name: "黄", desc: "竞拍成功获得黄级物品数最多的玩家" },
  凡: { name: "凡", desc: "竞拍成功获得凡级物品数最多的玩家" },
};

const RESULT_TYPE_TITLE_MAP = {
  功法: "功",
  丹药: "丹",
  武器: "器",
  阵法: "阵",
  符箓: "符",
  灵植: "植",
  灵兽: "兽",
  杂项: "杂",
};

const RESULT_QUALITY_TITLE_MAP = {
  圣: "圣",
  天: "天",
  地: "地",
  玄: "玄",
  黄: "黄",
  凡: "凡",
};

function addResultTitle(titleMap, playerId, code) {
  if (!titleMap[playerId]) titleMap[playerId] = new Set();
  titleMap[playerId].add(code);
}

function awardResultTitle(titleMap, playerIds, code) {
  playerIds.forEach((playerId) => addResultTitle(titleMap, playerId, code));
}

function sortResultTitles(codes) {
  return [...new Set(codes)].sort((a, b) => RESULT_TITLE_ORDER.indexOf(a) - RESULT_TITLE_ORDER.indexOf(b));
}

function numericBidEntries(log) {
  return Object.entries(log?.bids || {})
    .filter(([, bid]) => typeof bid === "number" && Number.isFinite(bid) && bid >= 0)
    .map(([playerId, bid]) => ({ playerId, bid }))
    .sort((a, b) => b.bid - a.bid);
}

function awardByMax(titleMap, playerIds, metricsByPlayer, code, getter, options = {}) {
  const { requirePositive = false, requireFinite = true } = options;
  let best = -Infinity;
  const winners = [];
  playerIds.forEach((playerId) => {
    const value = getter(metricsByPlayer[playerId], playerId);
    if (requireFinite && !Number.isFinite(value)) return;
    if (requirePositive && !(value > 0)) return;
    if (value > best) {
      best = value;
      winners.length = 0;
      winners.push(playerId);
    } else if (value === best) {
      winners.push(playerId);
    }
  });
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

function awardByMin(titleMap, playerIds, metricsByPlayer, code, getter, options = {}) {
  const { requireFinite = true } = options;
  let best = Infinity;
  const winners = [];
  playerIds.forEach((playerId) => {
    const value = getter(metricsByPlayer[playerId], playerId);
    if (requireFinite && !Number.isFinite(value)) return;
    if (value < best) {
      best = value;
      winners.length = 0;
      winners.push(playerId);
    } else if (value === best) {
      winners.push(playerId);
    }
  });
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

function awardEventByExtreme(titleMap, code, events, mode = "max") {
  if (!events.length) return;
  const values = events.map((event) => event.value).filter((value) => Number.isFinite(value));
  if (!values.length) return;
  const target = mode === "min" ? Math.min(...values) : Math.max(...values);
  const winners = [...new Set(events.filter((event) => event.value === target).map((event) => event.playerId))];
  if (winners.length) awardResultTitle(titleMap, winners, code);
}

function buildGameResult(room) {
  const players = [...(room.players || [])];
  const playerIds = players.map((player) => player.id);
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const playerStateMap = Object.fromEntries(players.map((player) => [player.id, player]));
  const titleMap = Object.fromEntries(playerIds.map((playerId) => [playerId, new Set()]));
  const metricsByPlayer = Object.fromEntries(
    players.map((player) => [
      player.id,
      {
        maxWealth: room.settings.initialSpiritStone,
        firstAfterSettlementCount: 0,
        highestSingleBid: Number.NEGATIVE_INFINITY,
        totalWinningSpend: 0,
        usedToolTurns: 0,
        winRounds: 0,
        secondPlaceInWinningRounds: 0,
        positiveProfitTotal: 0,
        negativeLossAbsTotal: 0,
        profitableWinRounds: 0,
        losingWinRounds: 0,
        totalBidSum: 0,
        lowestBidRounds: 0,
        winAtRound: { 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
        typeCounts: Object.fromEntries(Object.keys(RESULT_TYPE_TITLE_MAP).map((key) => [key, 0])),
        qualityCounts: Object.fromEntries(Object.keys(RESULT_QUALITY_TITLE_MAP).map((key) => [key, 0])),
      },
    ])
  );

  const winningGapEvents = [];
  const positiveProfitEvents = [];
  const negativeLossEvents = [];
  const balances = Object.fromEntries(playerIds.map((playerId) => [playerId, room.settings.initialSpiritStone]));
  const roundStartBalancesByRoundNo = {};

    (room.game?.rounds || []).forEach((round) => {
      roundStartBalancesByRoundNo[round.roundNo] = { ...balances };
      const toolSpendByPlayer = Object.fromEntries(playerIds.map((playerId) => [playerId, 0]));

      (round.auction?.logs || []).forEach((log) => {
        const numericEntries = numericBidEntries(log);
        const validNumericEntries = numericEntries.filter(({ playerId }) => Boolean(metricsByPlayer[playerId]));

        validNumericEntries.forEach(({ playerId, bid }) => {
          metricsByPlayer[playerId].highestSingleBid = Math.max(metricsByPlayer[playerId].highestSingleBid, bid);
          metricsByPlayer[playerId].totalBidSum += bid;
        });

        if (validNumericEntries.length >= 2) {
          const lowestBid = Math.min(...validNumericEntries.map((entry) => entry.bid));
          validNumericEntries
            .filter((entry) => entry.bid === lowestBid)
            .forEach((entry) => {
              metricsByPlayer[entry.playerId].lowestBidRounds += 1;
            });
        }

        Object.entries(log?.usedTools || {}).forEach(([playerId, toolId]) => {
          if (!playerIds.includes(playerId) || !toolId) return;
          const tool = toolById(toolId);
          metricsByPlayer[playerId].usedToolTurns += 1;
          toolSpendByPlayer[playerId] += tool?.cost || 0;
        });

        if (log?.success && log?.winnerId && playerIds.includes(log.winnerId)) {
          if (log.roundNo >= 6 && log.roundNo <= 10) {
            metricsByPlayer[log.winnerId].winAtRound[log.roundNo] += 1;
          }

          if (validNumericEntries.length >= 2) {
            const secondBid = validNumericEntries[1].bid;
            validNumericEntries
              .filter((entry, index) => index > 0 && entry.bid === secondBid)
              .forEach((entry) => {
                metricsByPlayer[entry.playerId].secondPlaceInWinningRounds += 1;
              });
            winningGapEvents.push({ playerId: log.winnerId, value: validNumericEntries[0].bid - secondBid });
          }
        }
      });

    if (!round.settlement) return;

    playerIds.forEach((playerId) => {
      balances[playerId] -= toolSpendByPlayer[playerId] || 0;
      balances[playerId] -= round.settlement.entryFee || 0;
    });

    if (round.settlement.winnerId && playerIds.includes(round.settlement.winnerId) && metricsByPlayer[round.settlement.winnerId]) {
      const winnerId = round.settlement.winnerId;
      const profit = round.settlement.profit || 0;
      metricsByPlayer[winnerId].winRounds += 1;
      metricsByPlayer[winnerId].totalWinningSpend += round.settlement.winningBid || 0;

      if (profit > 0) {
        metricsByPlayer[winnerId].positiveProfitTotal += profit;
        metricsByPlayer[winnerId].profitableWinRounds += 1;
        positiveProfitEvents.push({ playerId: winnerId, value: profit });
      }
      if (profit < 0) {
        const absLoss = Math.abs(profit);
        metricsByPlayer[winnerId].negativeLossAbsTotal += absLoss;
        metricsByPlayer[winnerId].losingWinRounds += 1;
        negativeLossEvents.push({ playerId: winnerId, value: absLoss });
      }

      balances[winnerId] += profit;

      (round.placedItems || []).forEach((item) => {
        if (metricsByPlayer[winnerId].typeCounts[item.type] !== undefined) {
          metricsByPlayer[winnerId].typeCounts[item.type] += 1;
        }
        if (metricsByPlayer[winnerId].qualityCounts[item.quality] !== undefined) {
          metricsByPlayer[winnerId].qualityCounts[item.quality] += 1;
        }
      });
    }

    Object.entries(round.settlement.sharing || {}).forEach(([playerId, delta]) => {
      if (!playerIds.includes(playerId)) return;
      balances[playerId] += Number(delta) || 0;
    });

    const topBalance = Math.max(...playerIds.map((playerId) => balances[playerId]));
    playerIds.forEach((playerId) => {
      metricsByPlayer[playerId].maxWealth = Math.max(metricsByPlayer[playerId].maxWealth, balances[playerId]);
      if (balances[playerId] === topBalance) {
        metricsByPlayer[playerId].firstAfterSettlementCount += 1;
      }
    });
  });

  const rankingBase = [...players].sort((a, b) => b.spiritStone - a.spiritStone);
  if (rankingBase[0]) addResultTitle(titleMap, rankingBase[0].id, "冠");
  if (rankingBase[1]) addResultTitle(titleMap, rankingBase[1].id, "亚");
  if (rankingBase[2]) addResultTitle(titleMap, rankingBase[2].id, "季");
  if (rankingBase[rankingBase.length - 1]) addResultTitle(titleMap, rankingBase[rankingBase.length - 1].id, "尾");
  rankingBase.filter((player) => player.spiritStone < 0).forEach((player) => addResultTitle(titleMap, player.id, "破"));

  awardByMax(titleMap, playerIds, metricsByPlayer, "魁", (metric) => metric.firstAfterSettlementCount, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "富", (metric) => metric.maxWealth);
  awardByMax(titleMap, playerIds, metricsByPlayer, "豪", (metric) => metric.highestSingleBid, { requireFinite: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "阔", (metric) => metric.totalWinningSpend, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "宝", (metric) => metric.usedToolTurns);
  awardByMin(titleMap, playerIds, metricsByPlayer, "省", (metric) => metric.usedToolTurns);
  awardByMax(titleMap, playerIds, metricsByPlayer, "龙", (metric) => metric.winRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "凤", (metric) => metric.secondPlaceInWinningRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "神", (metric) => metric.positiveProfitTotal, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "鬼", (metric) => metric.negativeLossAbsTotal, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "牛", (metric) => metric.profitableWinRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "熊", (metric) => metric.losingWinRounds, { requirePositive: true });
  awardByMax(titleMap, playerIds, metricsByPlayer, "虎", (metric) => metric.totalBidSum);
  awardByMin(titleMap, playerIds, metricsByPlayer, "龟", (metric) => metric.totalBidSum);
  awardByMax(titleMap, playerIds, metricsByPlayer, "鼠", (metric) => metric.lowestBidRounds, { requirePositive: true });

  awardEventByExtreme(titleMap, "智", winningGapEvents, "min");
  awardEventByExtreme(titleMap, "亏", winningGapEvents, "max");
  awardEventByExtreme(titleMap, "秀", positiveProfitEvents, "max");
  awardEventByExtreme(titleMap, "吉", positiveProfitEvents, "min");
  awardEventByExtreme(titleMap, "凶", negativeLossEvents, "min");
  awardEventByExtreme(titleMap, "衰", negativeLossEvents, "max");

  [
    [6, "福"],
    [7, "寿"],
    [8, "禄"],
    [9, "财"],
    [10, "喜"],
  ].forEach(([roundNo, code]) => {
    const owners = playerIds.filter((playerId) => metricsByPlayer[playerId].winAtRound[roundNo] > 0);
    if (owners.length) awardResultTitle(titleMap, owners, code);
  });

  Object.entries(RESULT_TYPE_TITLE_MAP).forEach(([typeName, code]) => {
    awardByMax(titleMap, playerIds, metricsByPlayer, code, (metric) => metric.typeCounts[typeName], { requirePositive: true });
  });

  Object.entries(RESULT_QUALITY_TITLE_MAP).forEach(([qualityName, code]) => {
    awardByMax(titleMap, playerIds, metricsByPlayer, code, (metric) => metric.qualityCounts[qualityName], { requirePositive: true });
  });

  const ranking = rankingBase.map((player) => {
    const titleCodes = sortResultTitles([...titleMap[player.id]]);
    const netProfit = player.spiritStone - room.settings.initialSpiritStone;
    return {
      id: player.id,
      name: player.name,
      spiritStone: player.spiritStone,
      stats: {
        ...player.stats,
        totalProfit: netProfit,
      },
      titles: titleCodes,
      titleDetails: titleCodes.map((code) => ({ code, ...(RESULT_TITLE_META[code] || {}) })),
      achievementMetrics: metricsByPlayer[player.id],
    };
  });

  const rounds = (room.game?.rounds || []).map((round) => ({
    roundNo: round.roundNo,
    realm: round.realm,
    targetCells: round.targetCells || 0,
    itemCount: (round.placedItems || []).length,
    typeSummary: countBy(round.placedItems || [], "type"),
    qualitySummary: countBy(round.placedItems || [], "quality"),
    matrixSummary: buildQualityTypeMatrix(round.placedItems || []),
    winnerId: round.settlement?.winnerId || null,
    winnerName: round.settlement?.winnerId ? playerNames[round.settlement.winnerId] || round.settlement.winnerId : null,
    winningBid: round.settlement?.winningBid || 0,
    totalValue: round.settlement?.totalValue || 0,
    profit: round.settlement?.profit || 0,
    logs: (round.auction.logs || []).map((log) => {
      const mergedBids = { ...(log.bids || {}) };
      const mergedStatusByPlayer = { ...(log.statusByPlayer || {}) };
      const roundStartBalances = roundStartBalancesByRoundNo[round.roundNo] || {};

      playerIds.forEach((playerId) => {
        if (!(playerId in mergedBids)) {
          mergedBids[playerId] = null;
        }
        if (!mergedStatusByPlayer[playerId] && (mergedBids[playerId] === null || mergedBids[playerId] === undefined)) {
          const roundStartStone = Number(roundStartBalances[playerId] ?? room.settings.initialSpiritStone);
          const playerState = playerStateMap[playerId];
          if (roundStartStone < 0 || playerState?.spiritStone < 0) {
            mergedStatusByPlayer[playerId] = "破产";
          } else if (!playerState || !playerState.connected || playerState.managed) {
            mergedStatusByPlayer[playerId] = "离线";
          } else {
            mergedStatusByPlayer[playerId] = "放弃";
          }
        }
      });

      return {
        roundNo: log.roundNo,
        multiplier: log.multiplier,
        winnerId: log.winnerId,
        winnerName: log.winnerId ? playerNames[log.winnerId] || log.winnerId : null,
        bids: mergedBids,
        bidPlayerNames: Object.fromEntries(playerIds.map((playerId) => [playerId, playerNames[playerId] || playerId])),
        usedTools: log.usedTools,
        statusByPlayer: mergedStatusByPlayer,
        success: log.success,
      };
    }),
  }));

  return {
    gameId: room.game?.id || "",
    finishedAt: nowText(),
    titleMeta: RESULT_TITLE_META,
    ranking,
    rounds,
  };
}

function finishGame(room) {
  room.latestResult = buildGameResult(room);
  if (room.game) {
    room.game.status = "已完成";
  }
}

function advanceToNextRound(room) {
  if (!room.game) return;
  const round = getCurrentRound(room);
  if (!round || round.auction.phase !== "回合结算") return;

  if (room.game.currentRound >= room.game.totalRounds) {
    if (room.game.status !== "已完成") {
      finishGame(room);
    }
    return;
  }

  room.game.currentRound += 1;
  room.game.rounds.push(createRound(room, room.game.seedId || room.game.id, room.game.currentRound));
}

function buildClientState(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  const game = room.game;
  let currentRound = null;
  if (game) {
    const rawRound = game.rounds[game.currentRound - 1];
    if (rawRound) {
      const completedCount = rawRound.settlement
        ? room.players.filter((p) => rawRound.settlement.viewers[p.id]?.readyForNextRound || !p.connected || p.managed).length
        : 0;
      currentRound = {
        id: rawRound.id,
        roundNo: rawRound.roundNo,
        realm: rawRound.realm,
        targetCells: rawRound.targetCells,
        placedItems: rawRound.placedItems,
        systemHints: rawRound.systemHints,
        intel: rawRound.intelByPlayer[playerId] || createEmptyIntel(),
        skillHints: rawRound.skillHints[playerId] || [],
        toolHints: rawRound.toolHints[playerId] || [],
        settlement: rawRound.settlement
          ? {
              winnerId: rawRound.settlement.winnerId,
              winningBid: rawRound.settlement.winningBid,
              totalValue: rawRound.settlement.totalValue,
              profit: rawRound.settlement.profit,
              entryFee: rawRound.settlement.entryFee,
              sharing: rawRound.settlement.sharing,
              revealOrder: rawRound.settlement.revealOrder,
              startedAt: rawRound.settlement.startedAt,
              readyOpenAt: rawRound.settlement.readyOpenAt,
              allReadyCountdownAt: rawRound.settlement.allReadyCountdownAt,
              forceNextAt: rawRound.settlement.forceNextAt,
              viewer: rawRound.settlement.viewers[playerId] || null,
              completedCount,
              totalPlayers: room.players.length,
            }
          : null,
        auction: rawRound.auction,
      };
    }
  }

  return {
    selfId: playerId,
    phase: room.phase,
    room: {
      roomId: room.id,
      ownerId: room.ownerId,
      settings: room.settings,
      roleSelections: getRoomRoleSelectionMap(room),
      hasActiveGame: Boolean(game),
      hasActiveUnfinishedGame: Boolean(game && game.status !== "已完成"),
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        roleId: p.roleId,
        ready: p.ready,
        connected: p.connected,
        managed: p.managed,
        bankrupt: isBankrupt(p),
        isHost: p.id === room.ownerId,
        spiritStone: p.spiritStone,
        stats: p.stats,
      })),
      latestResult: room.latestResult,
    },
    game: game
      ? {
          id: game.id,
          currentRound: game.currentRound,
          totalRounds: game.totalRounds,
          status: game.status,
          currentRoundState: currentRound,
        }
      : null,
    chat: room.chat,
    meta: {
      roles: ROLES,
      tools: TOOLS,
      catalog: ITEM_CATALOG,
    },
    self: player
      ? {
          id: player.id,
          name: player.name,
          role: roleById(player.roleId),
          bankrupt: isBankrupt(player),
          spiritStone: player.spiritStone,
        }
      : null,
  };
}

function emitState(io, room) {
  room.players.forEach((p) => {
    if (!p.socketId) return;
    io.to(p.socketId).emit("state:update", buildClientState(room, p.id));
  });
}

function assignNextOwner(room) {
  if (!room.players.length) {
    room.ownerId = "";
    return;
  }
  const online = room.players.find((p) => p.connected && !p.managed);
  room.ownerId = online?.id || room.players[0].id;
}

function removePlayerCompletely(room, playerId) {
  const player = room.players.find((p) => p.id === playerId);
  if (player?.token) playerTokenMap.delete(player.token);
  room.players = room.players.filter((p) => p.id !== playerId);
  if (!room.players.length) {
    rooms.delete(room.id);
    return;
  }
  if (!room.players.find((p) => p.id === room.ownerId)) {
    assignNextOwner(room);
  }
}

function roomSummary(room) {
  return {
    roomId: room.id,
    ownerName: room.players.find((p) => p.id === room.ownerId)?.name || "无",
    playerCount: room.players.filter((p) => p.connected || !p.managed).length,
    maxPlayers: room.settings.maxPlayers,
    hasPassword: Boolean(room.settings.password),
    phase: room.phase,
    latestResult: Boolean(room.latestResult),
    currentRound: room.game?.currentRound || 0,
    totalRounds: room.game?.totalRounds || room.settings.totalRounds,
  };
}

function handlePlayerLeave(io, socket, room, player, reason = "主动退出") {
  const leavingPlayerId = player.id;
  const wasOwner = room.ownerId === leavingPlayerId;

  if (room.game) {
    player.connected = false;
    player.managed = true;
    player.socketId = "";
    player.ready = true;
    socket.leave(room.id);

    if (wasOwner) {
      assignNextOwner(room);
    }

    room.messageSeq += 1;
    room.chat.push({
      id: `${room.id}_${room.messageSeq}`,
      senderId: "system",
      senderName: "系统",
      text: `${player.name}已${reason}，当前转为离线托管${wasOwner ? `，房主已移交给${room.players.find((p) => p.id === room.ownerId)?.name || "其他修士"}` : ""}。`,
      time: nowText(),
    });
    if (room.chat.length > 80) room.chat = room.chat.slice(-80);

    const round = getCurrentRound(room);
    if (round?.settlement?.viewers?.[player.id]) {
      const viewer = round.settlement.viewers[player.id];
      viewer.mode = viewer.mode || "delay";
      viewer.revealIndex = round.settlement.revealOrder.length;
      viewer.completed = true;
      viewer.readyForNextRound = true;
      viewer.nextRevealAt = null;
    }

    if (round && round.auction.phase === "行动中") {
      processRound(room);
    }

    const hasAnyOnlinePlayer = room.players.some((p) => p.connected && p.socketId);
    if (!hasAnyOnlinePlayer) {
      room.players.forEach((p) => {
        if (p.token) playerTokenMap.delete(p.token);
      });
      rooms.delete(room.id);
      return;
    }

    emitState(io, room);
    return;
  }

  room.players = room.players.filter((p) => p.id !== leavingPlayerId);
  if (player.token) playerTokenMap.delete(player.token);
  socket.leave(room.id);

  if (!room.players.length) {
    rooms.delete(room.id);
    return;
  }

  if (wasOwner || !room.players.find((p) => p.id === room.ownerId)) {
    assignNextOwner(room);
  }

  room.messageSeq += 1;
  room.chat.push({
    id: `${room.id}_${room.messageSeq}`,
    senderId: "system",
    senderName: "系统",
    text: `${player.name}已${reason}，${wasOwner ? `房主已移交给${room.players.find((p) => p.id === room.ownerId)?.name || "其他修士"}` : "其席位已释放"}。`,
    time: nowText(),
  });
  if (room.chat.length > 80) room.chat = room.chat.slice(-80);

  emitState(io, room);
}

function findBySocket(socket) {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socket.id);
    if (player) return { room, player };
  }
  return null;
}

const app = express();
app.use(cors());
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "xuanhuan-auction-server" });
});
app.get("/rooms", (_req, res) => {
  res.json({ ok: true, rooms: [...rooms.values()].map(roomSummary) });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.game) continue;
    const round = getCurrentRound(room);
    if (!round) continue;
    const now = Date.now();

      if (round.auction.phase === "行动中") {
        autoSubmitManaged(room, round);
        if (round.auction.submittedIds.length >= round.auction.activePlayerIds.length && round.auction.activePlayerIds.length > 0) {
          processRound(room);
          emitState(io, room);
          continue;
        }
        if (round.auction.deadlineAt && now >= round.auction.deadlineAt) {
          round.auction.activePlayerIds.forEach((pid) => {
            if (!round.auction.submittedIds.includes(pid)) {
              round.auction.submittedIds.push(pid);
              round.auction.bids[pid] = null;
              const player = room.players.find((p) => p.id === pid);
              round.auction.statusByPlayer = {
                ...(round.auction.statusByPlayer || {}),
                [pid]: player && isBankrupt(player) ? "破产" : !player || !player.connected || player.managed ? "离线" : "放弃",
              };
            }
          });
          processRound(room);
          emitState(io, room);
          continue;
        }
      }

    if (round.auction.phase !== "回合结算" || !round.settlement) continue;

    let changed = false;
    const settlement = round.settlement;
    const revealCount = settlement.revealOrder.length;

    for (const player of room.players) {
      const viewer = settlement.viewers[player.id] || {
        mode: null,
        revealIndex: 0,
        nextRevealAt: now + REVEAL_STEP_MS,
        completed: false,
        readyForNextRound: false,
        chosenAt: null,
      };
      settlement.viewers[player.id] = viewer;

      if (!player.connected || player.managed) {
        if (viewer.revealIndex !== revealCount || !viewer.mode) {
          viewer.mode = "delay";
          viewer.revealIndex = revealCount;
          viewer.nextRevealAt = null;
          viewer.completed = true;
          viewer.chosenAt = viewer.chosenAt || now;
          changed = true;
        }
        if (!viewer.readyForNextRound) {
          viewer.readyForNextRound = true;
          changed = true;
        }
        continue;
      }

      if (viewer.mode === "instant" && !viewer.completed) {
        viewer.revealIndex = revealCount;
        viewer.completed = true;
        viewer.nextRevealAt = null;
        changed = true;
      }

      if (viewer.mode === "delay" && !viewer.completed) {
        if (revealCount === 0) {
          viewer.completed = true;
          changed = true;
        } else if (viewer.nextRevealAt && now >= viewer.nextRevealAt) {
          const steps = Math.max(1, Math.floor((now - viewer.nextRevealAt) / REVEAL_STEP_MS) + 1);
          viewer.revealIndex = Math.min(revealCount, viewer.revealIndex + steps);
          viewer.nextRevealAt = now + REVEAL_STEP_MS;
          if (viewer.revealIndex >= revealCount) {
            viewer.completed = true;
          }
          changed = true;
        }
      }
    }

    const isFinalRound = room.game.currentRound >= room.game.totalRounds;

    if (isFinalRound) {
      if (!room.latestResult) {
        room.latestResult = buildGameResult(room);
        room.game.status = "已完成";
        changed = true;
      }

      if (changed) emitState(io, room);
      continue;
    }

    for (const player of room.players) {
      const viewer = settlement.viewers[player.id];
      if (!viewer) continue;
      if (!viewer.readyForNextRound && now >= (viewer.autoReadyAt || settlement.forceNextAt)) {
        viewer.readyForNextRound = true;
        changed = true;
      }
    }

    const allReady = room.players.every((player) => {
      const viewer = settlement.viewers[player.id];
      return !player.connected || player.managed || Boolean(viewer?.readyForNextRound);
    });

    if (allReady && !settlement.allReadyCountdownAt) {
      settlement.allReadyCountdownAt = now + NEXT_ROUND_PREPARE_MS;
      changed = true;
    }

    if (!allReady && settlement.allReadyCountdownAt) {
      settlement.allReadyCountdownAt = null;
      changed = true;
    }

    if (settlement.allReadyCountdownAt && now >= settlement.allReadyCountdownAt) {
      advanceToNextRound(room);
      changed = true;
    }

    if (changed) emitState(io, room);
  }
}, 200);

io.on("connection", (socket) => {
  const auth = socket.handshake.auth || {};
  const token = auth.token;
  const known = token ? playerTokenMap.get(token) : null;
  if (known) {
    const room = rooms.get(known.roomId);
    const player = room?.players.find((p) => p.id === known.playerId);
    if (room && player) {
      player.socketId = socket.id;
      player.connected = true;
      player.managed = false;
      socket.join(room.id);
      emitState(io, room);
    }
  }

  socket.on("room:list", (cb) => {
    cb?.({ ok: true, rooms: [...rooms.values()].map(roomSummary) });
  });

  socket.on("room:create", (payload, cb) => {
    const roomId = randomRoomId();
    const tokenValue = randomUUID();
    const room = {
      id: roomId,
      ownerId: "",
      phase: "房间准备",
      settings: {
        ...DEFAULT_SETTINGS,
        maxPlayers: clampMaxPlayers(payload?.maxPlayers || DEFAULT_SETTINGS.maxPlayers),
        password: payload?.password || "",
        hintRounds: normalizeHintRounds(payload?.hintRounds, DEFAULT_SETTINGS.hintRounds),
        multipliers: normalizeMultipliers(payload?.multipliers, DEFAULT_SETTINGS.multipliers),
        allowDuplicateRoles: DEFAULT_SETTINGS.allowDuplicateRoles,
      },
      players: [],
      game: null,
      latestResult: null,
      chat: [],
      messageSeq: 0,
    };
    const player = createPlayer(payload?.name || "房主", tokenValue);
    room.ownerId = player.id;
    player.socketId = socket.id;
    room.players.push(player);
    rooms.set(roomId, room);
    playerTokenMap.set(tokenValue, { roomId, playerId: player.id });
    socket.join(roomId);
    room.messageSeq += 1;
    room.chat.push({
      id: `${room.id}_${room.messageSeq}`,
      senderId: "system",
      senderName: "系统",
      text: `${player.name}已进入房间。`,
      time: nowText(),
    });
    cb?.({ ok: true, roomId, token: tokenValue, playerId: player.id });
    emitState(io, room);
  });

  socket.on("room:join", (payload, cb) => {
    const roomId = String(payload?.roomId || "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      cb?.({ ok: false, message: "房间不存在" });
      return;
    }
    if (room.phase === "房间准备" && room.players.length > 0 && room.players.every((p) => !p.connected && p.managed)) {
      room.players.forEach((p) => {
        if (p.token) playerTokenMap.delete(p.token);
      });
      rooms.delete(room.id);
      cb?.({ ok: false, message: "房间不存在" });
      return;
    }
    if (room.settings.password && room.settings.password !== (payload?.password || "")) {
      cb?.({ ok: false, message: "房间密码错误" });
      return;
    }
    if (room.players.length >= room.settings.maxPlayers) {
      cb?.({ ok: false, message: "房间已满" });
      return;
    }
    if (room.phase !== "房间准备" || room.latestResult) {
      cb?.({ ok: false, message: "当前房间正在游戏中，暂不可加入" });
      return;
    }

    const tokenValue = randomUUID();
    const player = createPlayer(payload?.name || "新道友", tokenValue);
    player.socketId = socket.id;
    room.players.push(player);
    playerTokenMap.set(tokenValue, { roomId, playerId: player.id });
    socket.join(roomId);
    const owner = room.players.find((p) => p.id === room.ownerId);
    if (!owner || !owner.connected || owner.managed) {
      assignNextOwner(room);
    }
    room.messageSeq += 1;
    room.chat.push({
      id: `${room.id}_${room.messageSeq}`,
      senderId: "system",
      senderName: "系统",
      text: `${player.name}已进入房间。`,
      time: nowText(),
    });
    if (room.chat.length > 80) room.chat = room.chat.slice(-80);
    cb?.({ ok: true, roomId, token: tokenValue, playerId: player.id });
    emitState(io, room);
  });

  socket.on("player:update", (payload) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    if (room.phase !== "房间准备") return;

    if (typeof payload?.ready === "boolean") {
      player.ready = payload.ready;
    }

    if (typeof payload?.roleId === "string" && canSelectRole(room, player.id, payload.roleId)) {
      player.roleId = payload.roleId;
    }

    emitState(io, room);
  });

  socket.on("room:updateSettings", (payload) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    if (room.phase !== "房间准备" || room.ownerId !== player.id) return;
    room.settings = {
      ...room.settings,
      ...payload,
      password: typeof payload?.password === "string" ? payload.password : room.settings.password,
      maxPlayers: clampMaxPlayers(payload?.maxPlayers ?? room.settings.maxPlayers),
      hintRounds: normalizeHintRounds(payload?.hintRounds, room.settings.hintRounds),
      multipliers: normalizeMultipliers(payload?.multipliers, room.settings.multipliers),
      totalRounds: Number(payload?.totalRounds || room.settings.totalRounds),
      initialSpiritStone: Number(payload?.initialSpiritStone || room.settings.initialSpiritStone),
      entryFee: Number(payload?.entryFee || room.settings.entryFee),
      allowDuplicateRoles:
        typeof payload?.allowDuplicateRoles === "boolean" ? payload.allowDuplicateRoles : room.settings.allowDuplicateRoles,
    };

    if (!room.settings.allowDuplicateRoles) {
      const taken = new Set();
      room.players.forEach((p) => {
        if (!taken.has(p.roleId)) {
          taken.add(p.roleId);
          return;
        }
        const fallback = ROLES.find((role) => !taken.has(role.id));
        if (fallback) {
          p.roleId = fallback.id;
          taken.add(fallback.id);
        }
      });
    }

    emitState(io, room);
  });

  socket.on("game:start", () => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    if (room.ownerId !== player.id || room.phase !== "房间准备") return;
    const activePlayers = room.players.filter((p) => !isBankrupt(p));
    const readyCount = activePlayers.filter((p) => p.ready).length;
    if (activePlayers.length < 2 || readyCount !== activePlayers.length) return;
    startGame(room);
    emitState(io, room);
  });

  socket.on("action:useTool", ({ toolId }) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    if (room.phase !== "游戏中" || !room.game) return;
    const round = getCurrentRound(room);
    if (!round || round.auction.phase !== "行动中") return;
    if (!round.auction.activePlayerIds.includes(player.id)) return;
    if (round.auction.submittedIds.includes(player.id)) return;
    if (round.auction.usedTools[player.id]) return;
    if (round.auction.bidRound >= 6) {
      round.toolHints[player.id].push("推演提示：第六轮及之后不可继续推演。");
      emitState(io, room);
      return;
    }
    if (isBankrupt(player)) {
      round.toolHints[player.id].push("推演提示：你已破产，无法继续推演。请等待本局结束。");
      emitState(io, room);
      return;
    }

    const tool = toolById(toolId);
    if (!tool) return;
    const history = round.auction.usedToolHistoryByPlayer[player.id] || [];
    if (history.includes(toolId)) {
      round.toolHints[player.id].push(`推演提示：【${tool.name}】本回合已经推演过，不可再次施展。`);
      emitState(io, room);
      return;
    }
    if (player.spiritStone < tool.cost) {
      round.toolHints[player.id].push(`推演提示：灵石不足，无法施展【${tool.name}】（需要${tool.cost}灵石）`);
      emitState(io, room);
      return;
    }

    const rng = createRng(hashSeed(`${room.game.seedId || room.game.id}_${round.id}_${player.id}_${toolId}_${round.auction.bidRound}`));
    const text = applyHint(tool.effect, round.intelByPlayer[player.id], round, rng, `推演【${tool.name}】`);
    round.toolHints[player.id].push(`${text}（消耗${tool.cost}灵石）`);
    round.intelByPlayer[player.id].texts.push(text);
    round.auction.usedTools[player.id] = tool.id;
    round.auction.usedToolHistoryByPlayer[player.id] = [...history, tool.id];
    player.stats.usedTools += 1;
    player.stats.toolSpend += tool.cost;
    player.spiritStone -= tool.cost;
    emitState(io, room);
  });

  socket.on("action:submitBid", ({ amount }) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    if (room.phase !== "游戏中" || !room.game) return;
    const round = getCurrentRound(room);
    if (!round || round.auction.phase !== "行动中") return;
    if (!round.auction.activePlayerIds.includes(player.id)) return;
    if (round.auction.submittedIds.includes(player.id)) return;
    if (isBankrupt(player)) {
      round.toolHints[player.id].push("竞价提示：你已破产，无法继续参与竞拍。请等待本局结束。");
      emitState(io, room);
      return;
    }
    const bid = amount === null || amount === undefined || amount === "" ? null : Number(amount);
    if (bid !== null && (!Number.isFinite(bid) || bid < 0)) return;
    if (bid !== null && bid > player.spiritStone) {
      round.toolHints[player.id].push(`竞价提示：灵石不足，当前最多只能出价 ${player.spiritStone}。`);
      emitState(io, room);
      return;
    }
    if (bid === null) {
      round.auction.statusByPlayer = {
        ...(round.auction.statusByPlayer || {}),
        [player.id]: isBankrupt(player) ? "破产" : !player.connected || player.managed ? "离线" : "放弃",
      };
    }
    round.auction.bids[player.id] = bid;
    round.auction.submittedIds.push(player.id);
    processRound(room);
    emitState(io, room);
  });

  socket.on("settlement:chooseReveal", ({ mode }) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    const round = getCurrentRound(room);
    if (!round || round.auction.phase !== "回合结算" || !round.settlement) return;
    const viewer = round.settlement.viewers[player.id];
    if (!viewer) return;
    const total = round.settlement.revealOrder.length;
    if (mode !== "instant") return;
    viewer.mode = "instant";
    viewer.chosenAt = Date.now();
    viewer.revealIndex = total;
    viewer.nextRevealAt = null;
    viewer.completed = true;
    player.stats.revealsFastForwarded += 1;
    if (room.game && room.game.currentRound >= room.game.totalRounds && !room.latestResult) {
      room.latestResult = buildGameResult(room);
      room.game.status = "已完成";
    }
    emitState(io, room);
  });

  socket.on("settlement:readyNext", () => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    const round = getCurrentRound(room);
    if (!round || round.auction.phase !== "回合结算" || !round.settlement) return;
    const viewer = round.settlement.viewers[player.id];
    if (!viewer || !viewer.completed) return;
    viewer.readyForNextRound = !viewer.readyForNextRound;
    if (!viewer.readyForNextRound) {
      round.settlement.allReadyCountdownAt = null;
    }
    emitState(io, room);
  });

  socket.on("round:forceNext", () => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    const round = getCurrentRound(room);
    if (!round || round.auction.phase !== "回合结算" || !round.settlement) return;
    if (room.ownerId !== player.id) return;
    advanceToNextRound(room);
    emitState(io, room);
  });


  socket.on("chat:send", ({ text }) => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    const clean = String(text || "").trim().slice(0, 200);
    if (!clean) return;
    room.messageSeq += 1;
    const msg = {
      id: `${room.id}_${room.messageSeq}`,
      senderId: player.id,
      senderName: player.name,
      text: clean,
      time: nowText(),
    };
    room.chat.push(msg);
    if (room.chat.length > 80) room.chat = room.chat.slice(-80);
    emitState(io, room);
  });


  socket.on("room:leave", (_payload, cb) => {
    const found = findBySocket(socket);
    if (!found) {
      cb?.({ ok: false, message: "当前不在房间中" });
      return;
    }
    const { room, player } = found;
    handlePlayerLeave(io, socket, room, player, "退出房间");
    cb?.({ ok: true });
  });

  socket.on("room:kickPlayer", ({ playerId }, cb) => {
    const found = findBySocket(socket);
    if (!found) {
      cb?.({ ok: false, message: "当前不在房间中" });
      return;
    }
    const { room, player } = found;
    if (room.phase !== "房间准备" || room.ownerId !== player.id) {
      cb?.({ ok: false, message: "仅房主可在准备阶段踢人" });
      return;
    }
    if (!playerId || playerId === player.id) {
      cb?.({ ok: false, message: "无法踢出该玩家" });
      return;
    }
    const target = room.players.find((p) => p.id === playerId);
    if (!target) {
      cb?.({ ok: false, message: "玩家不存在" });
      return;
    }
    if (target.socketId) {
      io.to(target.socketId).emit("room:kicked", { roomId: room.id });
    }
    if (target.socketId) {
      io.sockets.sockets.get(target.socketId)?.leave(room.id);
    }
    removePlayerCompletely(room, target.id);
    room.messageSeq += 1;
    room.chat.push({
      id: `${room.id}_${room.messageSeq}`,
      senderId: "system",
      senderName: "系统",
      text: `${target.name}已被房主请离房间。`,
      time: nowText(),
    });
    if (room.chat.length > 80) room.chat = room.chat.slice(-80);
    emitState(io, room);
    cb?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const found = findBySocket(socket);
    if (!found) return;
    const { room, player } = found;
    player.connected = false;
    player.managed = true;
    player.socketId = "";
    player.ready = true;

    if (room.ownerId === player.id) {
      assignNextOwner(room);
      room.messageSeq += 1;
      room.chat.push({
        id: `${room.id}_${room.messageSeq}`,
        senderId: "system",
        senderName: "系统",
        text: `${player.name}已断线，房主暂移交给${room.players.find((p) => p.id === room.ownerId)?.name || "其他修士"}。`,
        time: nowText(),
      });
      if (room.chat.length > 80) room.chat = room.chat.slice(-80);
    }

    if (room.phase === "房间准备" && room.players.every((p) => !p.connected && p.managed)) {
      room.players.forEach((p) => {
        if (p.token) playerTokenMap.delete(p.token);
      });
      rooms.delete(room.id);
      return;
    }

    const round = getCurrentRound(room);
    if (round?.settlement?.viewers?.[player.id]) {
      const viewer = round.settlement.viewers[player.id];
      viewer.mode = viewer.mode || "delay";
      viewer.revealIndex = round.settlement.revealOrder.length;
      viewer.completed = true;
      viewer.readyForNextRound = true;
      viewer.nextRevealAt = null;
    }

    if (round && round.auction.phase === "行动中") {
      processRound(room);
    }
    emitState(io, room);
  });
});

httpServer.listen(PORT, () => {
  console.log(`[server] 修仙拍卖联机服务启动: http://localhost:${PORT}`);
});
