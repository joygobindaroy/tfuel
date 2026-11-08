import assert from "node:assert/strict";
// pure helper test (no DOM): digits from Bangla / Hindi / Arabic keyboards
(async () => {
  (globalThis as any).window = {}; (globalThis as any).document = {};
  const { normDigits } = await import("../lib/client");
  assert.equal(normDigits("১২৩৪৫৬৭৮৯০"), "1234567890");
  assert.equal(normDigits("१२३"), "123"); assert.equal(normDigits("٤٥٦"), "456"); assert.equal(normDigits("۷۸۹"), "789");
  assert.equal(normDigits("৳১২.৫ABC"), "৳12.5ABC"); assert.equal(normDigits("plain 42"), "plain 42");
  console.log("v31.3 OK");
})().catch((e) => { console.error(e); process.exit(1); });
