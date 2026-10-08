import assert from "node:assert/strict";
import test from "node:test";
import { answerPreview, createWorkspace } from "../domain/preview/workspace.ts";
test("third successful answer completes preview and fourth cannot add records", () => {
  let state = createWorkspace("C07");
  state = answerPreview(state, "career"); state = answerPreview(state, "relationship"); state = answerPreview(state, "correction");
  assert.equal(state.answered, 3); assert.equal(state.messages.length, 6);
  assert.equal(answerPreview(state, "career"), state);
});
test("failed answer consumes no quota or message", () => {
  const state = answerPreview(createWorkspace("C07"), "career");
  assert.equal(answerPreview(state, "relationship", true), state);
});
test("account records remain independent", () => {
  const first = answerPreview(createWorkspace("C07"), "correction");
  const second = createWorkspace("C08");
  assert.equal(first.corrected, true); assert.equal(second.corrected, false); assert.equal(second.answered, 0);
});
test("correction retains original discussion and appends feedback", () => {
  const initial = answerPreview(createWorkspace("C07"), "career");
  const corrected = answerPreview(initial, "correction");
  assert.deepEqual(corrected.messages.slice(0, 2), initial.messages);
  assert.equal(initial.corrected, false); assert.equal(corrected.corrected, true);
});
test("career response uses the selected synthetic profile", () => {
  const state = answerPreview(createWorkspace("C08"), "career");
  assert.match(state.messages[1].text, /运营/); assert.doesNotMatch(state.messages[1].text, /独立设计/);
});
