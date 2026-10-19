import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, splitBill, toCents } from '../core.mjs';
const people = [{ id: 'a', name: 'Ava' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Casey' }];
test('converts decimal amounts to cents', () => {
  assert.equal(toCents('12'), 1200); assert.equal(toCents('12.3'), 1230); assert.equal(toCents('0.01'), 1);
});
test('rejects invalid money and precision', () => {
  assert.throws(() => toCents('-1.00')); assert.throws(() => toCents('1.999')); assert.throws(() => toCents('abc'));
});
test('splits evenly and assigns remainder pennies deterministically', () => {
  const result = splitBill({ people, items: [{ amountCents: 100, participantIds: ['a', 'b', 'c'] }] });
  assert.deepEqual(result.people.map((person) => person.baseCents), [34, 33, 33]);
  assert.equal(result.people.reduce((sum, person) => sum + person.baseCents, 0), 100);
});
test('charges an item only to selected participants', () => {
  const result = splitBill({ people, items: [{ amountCents: 1500, participantIds: ['a', 'c'] }] });
  assert.deepEqual(result.people.map((person) => person.baseCents), [750, 0, 750]);
});
test('calculates tax and tip and allocates every penny', () => {
  const result = splitBill({ people, items: [{ amountCents: 1001, participantIds: ['a', 'b', 'c'] }], taxPercent: 8.25, tipPercent: 15 });
  assert.equal(result.taxCents, 83); assert.equal(result.tipCents, 150); assert.equal(result.totalCents, 1234);
  assert.equal(result.people.reduce((sum, person) => sum + person.totalCents, 0), 1234);
});
test('handles an empty bill', () => {
  const result = splitBill({ people, items: [], taxPercent: 0, tipPercent: 0 });
  assert.equal(result.totalCents, 0); assert.deepEqual(result.people.map((person) => person.totalCents), [0, 0, 0]);
});
test('rejects unassigned items and invalid percentages', () => {
  assert.throws(() => splitBill({ people, items: [{ amountCents: 100, participantIds: [] }] }));
  assert.throws(() => splitBill({ people, items: [], taxPercent: 101 }));
  assert.throws(() => splitBill({ people, items: [], tipPercent: -1 }));
});
test('formats selected currencies', () => {
  assert.match(formatMoney(1234, 'GBP'), /12\.34/); assert.match(formatMoney(1234, 'USD'), /12\.34/);
});
test('rejects an empty people list', () => { assert.throws(() => splitBill({ people: [], items: [] })); });
