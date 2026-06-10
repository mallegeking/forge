import { describe, it, expect } from "vitest";
import {
  estimateMaintenance,
  goalAdjustment,
  proteinTargetGrams,
  computeTargets,
  buildNutritionBrief,
  type NutritionTargets,
} from "./nutrition";

describe("estimateMaintenance", () => {
  it("scales bodyweight by the activity factor, rounded to nearest 10", () => {
    // 82kg × 31 (moderate) = 2542 → 2540
    expect(estimateMaintenance(82, "moderate")).toBe(2540);
    // 82kg × 26 (sedentary) = 2132 → 2130
    expect(estimateMaintenance(82, "sedentary")).toBe(2130);
  });

  it("rises with activity level", () => {
    expect(estimateMaintenance(80, "very_active")).toBeGreaterThan(
      estimateMaintenance(80, "sedentary")
    );
  });
});

describe("goalAdjustment", () => {
  it("cuts, holds, and gains", () => {
    expect(goalAdjustment("cut").kcalDelta).toBe(-500);
    expect(goalAdjustment("maintain").kcalDelta).toBe(0);
    expect(goalAdjustment("gain").kcalDelta).toBe(250);
  });
});

describe("proteinTargetGrams", () => {
  it("is highest on a cut and rounds to nearest 5", () => {
    // 82 × 2.2 = 180.4 → 180
    expect(proteinTargetGrams(82, "cut")).toBe(180);
    // 82 × 1.8 = 147.6 → 150
    expect(proteinTargetGrams(82, "maintain")).toBe(150);
    expect(proteinTargetGrams(82, "cut")).toBeGreaterThan(
      proteinTargetGrams(82, "maintain")
    );
  });
});

describe("computeTargets", () => {
  it("auto-computes from maintenance + goal delta", () => {
    const t = computeTargets({ weightKg: 82, activity: "moderate", goal: "gain" });
    expect(t.maintenance).toBe(2540);
    expect(t.calories).toBe(2790); // 2540 + 250
    expect(t.proteinG).toBe(165); // 82 × 2.0 = 164 → 165
    expect(t.source).toBe("auto");
  });

  it("lets a positive override win and flags the source", () => {
    const t = computeTargets({
      weightKg: 82,
      activity: "moderate",
      goal: "maintain",
      calorieOverride: 3000,
      proteinOverride: 200,
    });
    expect(t.calories).toBe(3000);
    expect(t.proteinG).toBe(200);
    expect(t.source).toBe("override");
    // maintenance is still reported for context
    expect(t.maintenance).toBe(2540);
  });

  it("ignores zero/empty overrides", () => {
    const t = computeTargets({
      weightKg: 82,
      activity: "moderate",
      goal: "maintain",
      calorieOverride: 0,
      proteinOverride: null,
    });
    expect(t.source).toBe("auto");
    expect(t.calories).toBe(2540);
  });
});

describe("buildNutritionBrief", () => {
  const targets: NutritionTargets = {
    calories: 2790,
    proteinG: 165,
    maintenance: 2540,
    source: "auto",
  };

  it("includes targets, goal, weight, and honours preferences", () => {
    const brief = buildNutritionBrief({
      targets,
      goal: "gain",
      activity: "moderate",
      weightKg: 82,
      weightTrendKg: 0.5,
      trainingSummary: "Bench Press: READY to add weight.",
      preferences: "vegetarian, no nuts",
    });
    expect(brief).toContain("2790 kcal");
    expect(brief).toContain("165g protein");
    expect(brief).toContain("lean gain");
    expect(brief).toContain("82kg");
    expect(brief).toContain("vegetarian, no nuts");
    expect(brief).toContain("Training context");
    expect(brief).toContain("+0.5kg");
  });

  it("notes when there's no trend, no training, and no preferences", () => {
    const brief = buildNutritionBrief({
      targets,
      goal: "maintain",
      activity: "light",
      weightKg: 80,
      weightTrendKg: null,
      trainingSummary: null,
      preferences: null,
    });
    expect(brief).toContain("not enough weigh-ins");
    expect(brief).toContain("none stated");
    expect(brief).not.toContain("Training context");
  });
});
