import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type CleanMarketRecord,
  upsertMarketProducts,
} from "../scrapers/engine/supabase-importer";

interface MarketProductInput {
  product_id: number;
  container_id: number;
  grade_id: number;
  mass: number | null;
  unit: string | null;
  province: string;
}

interface StoredMarketProduct extends MarketProductInput {
  id: number;
}

interface PageCall {
  from: number;
  to: number;
  orderColumn: string | null;
  ascending: boolean | null;
}

class MarketProductSelectQuery implements PromiseLike<{
  data: StoredMarketProduct[];
  error: null;
}> {
  private requestedProductIds = new Set<number>();
  private orderColumn: string | null = null;
  private ascending: boolean | null = null;
  private result: Promise<{
    data: StoredMarketProduct[];
    error: null;
  }> | null = null;

  constructor(
    private readonly rows: readonly StoredMarketProduct[],
    private readonly pageCalls: PageCall[],
  ) {}

  in(column: string, values: readonly number[]): this {
    expect(column).toBe("product_id");
    this.requestedProductIds = new Set(values);
    return this;
  }

  order(
    column: string,
    options: { readonly ascending: boolean },
  ): this {
    this.orderColumn = column;
    this.ascending = options.ascending;
    return this;
  }

  range(from: number, to: number): this {
    this.pageCalls.push({
      from,
      to,
      orderColumn: this.orderColumn,
      ascending: this.ascending,
    });

    const matchingRows = this.rows.filter((row) =>
      this.requestedProductIds.has(row.product_id),
    );

    if (this.orderColumn === "id") {
      matchingRows.sort((left, right) =>
        this.ascending
          ? left.id - right.id
          : right.id - left.id,
      );
    } else if (from === 0) {
      // Separate unordered requests are allowed to observe different row
      // orders. This deliberately repeats a boundary row and omits another,
      // reproducing the failure mode that stable ordering prevents.
      matchingRows.push(matchingRows.shift()!);
    }

    this.result = Promise.resolve({
      data: matchingRows.slice(from, to + 1),
      error: null,
    });
    return this;
  }

  then<TResult1 = { data: StoredMarketProduct[]; error: null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: StoredMarketProduct[]; error: null }) =>
          TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (!this.result) {
      throw new Error("The test query must be ranged before it is awaited.");
    }
    return this.result.then(onfulfilled, onrejected);
  }
}

class FakeMarketProductClient {
  readonly pageCalls: PageCall[] = [];
  upsertOptions: {
    onConflict: string;
    ignoreDuplicates: boolean;
  } | null = null;
  private rows: StoredMarketProduct[] = [];

  from(table: string) {
    expect(table).toBe("market_products");
    return {
      upsert: async (
        rows: readonly MarketProductInput[],
        options: { onConflict: string; ignoreDuplicates: boolean },
      ) => {
        this.upsertOptions = { ...options };
        this.rows = rows.map((row, index) => ({
          id: index + 1,
          ...row,
        }));
        return { error: null };
      },
      select: (columns: string) => {
        expect(columns).toBe(
          "id,product_id,container_id,grade_id,mass,unit,province",
        );
        return new MarketProductSelectQuery(this.rows, this.pageCalls);
      },
    };
  }
}

test("resolves every requested market-product key across stable pages over 1000 rows", async () => {
  const rowCount = 1_025;
  const records: CleanMarketRecord[] = Array.from(
    { length: rowCount },
    (_, index) => ({
      market: "Tshwane",
      marketDate: "2026-10-01",
      product: `Product ${index + 1}`,
      province: "Gauteng",
    }),
  );
  const productIds = new Map(
    records.map((record, index) => [record.product, index + 1]),
  );
  const client = new FakeMarketProductClient();

  const resolved = await upsertMarketProducts(
    client as unknown as SupabaseClient,
    records,
    productIds,
    new Map([["UNSPECIFIED", 1]]),
    new Map([["UNSPECIFIED", 1]]),
  );

  expect(resolved.size).toBe(rowCount);
  expect(new Set(resolved.values()).size).toBe(rowCount);
  expect(client.pageCalls).toEqual([
    { from: 0, to: 999, orderColumn: "id", ascending: true },
    { from: 1000, to: 1999, orderColumn: "id", ascending: true },
  ]);
  expect(client.upsertOptions).toEqual({
    onConflict: "product_id,container_id,grade_id,mass,unit,province",
    ignoreDuplicates: false,
  });
});
