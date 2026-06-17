import { COMMUNITY_TABS, HOME_ACTIONS, WATERFALL_COLUMNS, WEEKLY_CREATORS } from "./homeContent";

declare const require: any;

const { readFileSync } = require("fs");
const homeWxml = readFileSync("miniprogram/pages/home/home.wxml", "utf8");

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function test(name: string, run: () => void): void {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("home tabs include latest as default first tab", () => {
  assertEqual(COMMUNITY_TABS[0].label, "最新", "first tab");
  assertEqual(COMMUNITY_TABS.length, 4, "tab count");
});

test("home action shortcuts are hidden for now", () => {
  assertEqual(HOME_ACTIONS.length, 0, "action count");
});

test("weekly creator board does not ship mocked creators", () => {
  assertEqual(WEEKLY_CREATORS.length, 0, "creator count");
});

test("waterfall content does not ship mocked works", () => {
  assertEqual(WATERFALL_COLUMNS.length, 2, "column count");
  assertEqual(WATERFALL_COLUMNS[0].length, 0, "left column");
  assertEqual(WATERFALL_COLUMNS[1].length, 0, "right column");
});

test("home page shows empty states when real content is unavailable", () => {
  assert(homeWxml.includes("暂无真实创作者数据"), "missing creator empty state");
  assert(homeWxml.includes("暂无真实作品数据"), "missing work empty state");
});
