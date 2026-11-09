import { test, expect } from '@playwright/test';
import { canonicalPlan } from '../scrapers/engine/johannesburg-archive-bridge';

const catalogue = [
  { sourceProductId: '73', sourceProductName: 'PEACHES' },
  { sourceProductId: '102', sourceProductName: 'PEACHES' },
] as any;

const summary = [
  {
    ...catalogue[0], totalSales: 100, soldQuantity: 2,
    totalMass: 20, quantityAvailable: 4,
    mtd: { totalSales: 100, soldQuantity: 2, totalMass: 20 },
  },
  {
    ...catalogue[1], totalSales: 150, soldQuantity: 3,
    totalMass: 7.5, quantityAvailable: 5,
    mtd: { totalSales: 150, soldQuantity: 3, totalMass: 7.5 },
  },
] as any;

const mappings = catalogue.map((source: any) => ({
  ...source, productId: 27935, productName: 'Peaches',
  category: 'fresh_produce', active: true,
  allowCanonicalAggregation: false,
})) as any;

const details = [
  {
    ...catalogue[0], container: '10KG CARTON', unitMass: 10,
    variety: 'EARLY GRAND', class: 'CL 1', size: 'M',
    count: null, colour: 'YELLOW',
    totalSales: 100, soldQuantity: 2, totalMass: 20,
  },
  {
    ...catalogue[1], container: '2.5KG TRAY', unitMass: 2.5,
    variety: 'AZTEC GOLD', class: 'CL 1', size: null,
    count: '15', colour: 'YELLOW',
    totalSales: 150, soldQuantity: 3, totalMass: 7.5,
  },
] as any;

test('PEACHES aggregation requires detailed evidence', () => {
  expect(() => canonicalPlan('2026-11-06', catalogue, summary, mappings))
    .toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
});

test('distinct reconciled PEACHES source dimensions aggregate safely', () => {
  const plan = canonicalPlan('2026-11-06', catalogue, summary, mappings, details);
  expect(plan.records).toHaveLength(1);
  expect(plan.records[0].valueOfSales).toBe(250);
  expect(plan.records[0].quantitySold).toBe(5);
  expect(plan.records[0].totalMass).toBe(27.5);
  expect(plan.aliases[0].sourceProductIds).toEqual(['73', '102']);
});

test('overlapping PEACHES dimensions remain blocked', () => {
  const overlap = [details[0], {
    ...details[1],
    container: details[0].container,
    unitMass: details[0].unitMass,
    variety: details[0].variety,
    class: details[0].class,
    size: details[0].size,
    count: details[0].count,
    colour: details[0].colour,
  }];
  expect(() => canonicalPlan('2026-11-06', catalogue, summary, mappings, overlap))
    .toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
});

test('unreconciled PEACHES totals remain blocked', () => {
  const incorrect = [details[0], { ...details[1], totalSales: 149 }];
  expect(() => canonicalPlan('2026-11-06', catalogue, summary, mappings, incorrect))
    .toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
});

test('rounded whole-kg summary accepts a documented half-kg difference', () => {
  const fractionalDetails = [
    details[0],
    { ...details[1], totalMass: 7.5 },
  ];
  const roundedSummary = [
    summary[0],
    { ...summary[1], totalMass: 8 },
  ];

  const plan = canonicalPlan(
    '2026-11-06',
    catalogue,
    roundedSummary,
    mappings,
    fractionalDetails,
  );

  expect(plan.records).toHaveLength(1);
  expect(plan.records[0].totalMass).toBe(28);
});

test('mass discrepancy greater than rounding remains blocked', () => {
  const badSummary = [
    summary[0],
    { ...summary[1], totalMass: 9 },
  ];

  expect(() => canonicalPlan(
    '2026-11-06',
    catalogue,
    badSummary,
    mappings,
    details,
  )).toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
});

test('fractional mass summaries do not receive rounding permission', () => {
  const badSummary = [
    summary[0],
    { ...summary[1], totalMass: 8.5 },
  ];

  expect(() => canonicalPlan(
    '2026-11-06',
    catalogue,
    badSummary,
    mappings,
    details,
  )).toThrow('REVIEWED_ALIAS_AGGREGATION_REQUIRES_REVIEW');
});