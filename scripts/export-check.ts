import assert from "node:assert/strict";
import {
  formatUtc,
  toCsv,
  truncateCreativeText,
  type CsvColumn,
} from "../lib/csv";

const columns: CsvColumn[] = [
  { key: "text", header: "text" },
  { key: "number", header: "number", type: "number" },
  { key: "boolean", header: "boolean", type: "boolean" },
];

const simple = toCsv(columns, [{ text: "hello", number: 0, boolean: false }]);
assert.ok(simple.startsWith("\uFEFF"));
assert.ok(simple.includes("text,number,boolean\r\nhello,0,false\r\n"));

const quoted = toCsv([{ key: "value", header: "value" }], [
  { value: 'comma, quote " and\nline' },
]);
assert.ok(quoted.includes('"comma, quote "" and\nline"\r\n'));

for (const value of ["=SUM(A1)", "+1", "-1+2", "@cmd", "\tvalue", "\rvalue"]) {
  const csv = toCsv([{ key: "value", header: "value" }], [{ value }]);
  assert.ok(csv.includes(`'${value}`), `expected formula prefix for ${JSON.stringify(value)}`);
}

assert.ok(simple.includes("hello,0,false\r\n"), "numeric zero and boolean false remain unchanged");
assert.equal(
  toCsv([{ key: "id", header: "id" }], []),
  "\uFEFFid\r\n",
);
assert.ok(toCsv([{ key: "value", header: "value" }], [{ value: "café — déjà vu" }]).includes("café — déjà vu"));
assert.equal(truncateCreativeText("a".repeat(40_000)).length, 32_000 + " [truncated]".length);
assert.ok(truncateCreativeText("a".repeat(40_000)).endsWith(" [truncated]"));
assert.equal(
  toCsv([{ key: "a", header: "a" }, { key: "b", header: "b" }], [
    { a: null, b: undefined },
  ]),
  "\uFEFFa,b\r\n,\r\n",
);
assert.equal(formatUtc("2026-11-09T14:32:05.000Z"), "2026-11-09 14:32:05");

console.log("CSV export checks passed.");
