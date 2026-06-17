import { COMMUNITY_TABS, HOME_ACTIONS, WATERFALL_COLUMNS, WEEKLY_CREATORS } from "./homeContent";

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
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

test("weekly creator board has three creators", () => {
  assertEqual(WEEKLY_CREATORS.length, 3, "creator count");
});

test("waterfall content is split into two columns", () => {
  assertEqual(WATERFALL_COLUMNS.length, 2, "column count");
  assertEqual(WATERFALL_COLUMNS[0].length > 0, true, "left column");
  assertEqual(WATERFALL_COLUMNS[1].length > 0, true, "right column");
});
