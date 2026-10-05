import assert from "node:assert/strict";
import test from "node:test";
import { provinces, resolveBirthPlace } from "../lib/regions/index.ts";

test("region snapshot covers every parent with selectable children and unique codes", () => {
  assert.equal(provinces.length, 31);
  const codes = new Set<string>();
  for (const province of provinces) {
    assert.ok(province.children.length);
    for (const city of province.children) {
      assert.ok(city.children.length);
      for (const district of city.children) {
        assert.ok(district.name);
        assert.ok(!codes.has(district.code));
        codes.add(district.code);
      }
    }
  }
  assert.equal(codes.size, 3056);
});

test("municipalities resolve without a redundant 市辖区 label", () => {
  assert.equal(resolveBirthPlace({ province: "11", city: "1101", district: "110105" }), "北京市 朝阳区");
});

test("ordinary province city county hierarchy resolves to a compatible string", () => {
  assert.equal(resolveBirthPlace({ province: "44", city: "4401", district: "440106" }), "广东省 广州市 天河区");
});

test("incomplete and cross-parent selections cannot submit stale place codes", () => {
  assert.equal(resolveBirthPlace({ province: "44", city: "1101", district: "110105" }), "");
  assert.equal(resolveBirthPlace({ province: "11", city: "1101", district: "" }), "");
  assert.equal(resolveBirthPlace({ province: "44", city: "4401", district: "110105" }), "");
});
