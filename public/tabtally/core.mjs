export function toCents(value) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Enter an amount with up to two decimal places.');
  const amount = Number(text);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount must be a non-negative number.');
  return Math.round(amount * 100);
}
function validatePercent(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error(label + ' must be between 0 and 100.');
  return number;
}
function allocateProportionally(totalCents, weights) {
  const sum = weights.reduce((total, weight) => total + weight, 0);
  if (totalCents === 0 || sum === 0) return weights.map(() => 0);
  const exact = weights.map((weight) => totalCents * weight / sum);
  const allocated = exact.map(Math.floor);
  const remaining = totalCents - allocated.reduce((total, value) => total + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - allocated[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < remaining; index += 1) allocated[order[index].index] += 1;
  return allocated;
}
export function splitBill({ people, items, taxPercent = 0, tipPercent = 0 }) {
  if (!Array.isArray(people) || people.length === 0) throw new Error('Add at least one person before splitting the bill.');
  if (!Array.isArray(items)) throw new Error('Items must be a list.');
  const taxRate = validatePercent(taxPercent, 'Tax');
  const tipRate = validatePercent(tipPercent, 'Tip');
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const shares = people.map((person) => ({ id: person.id, name: person.name, baseCents: 0, taxCents: 0, tipCents: 0, totalCents: 0 }));
  const shareIndex = new Map(shares.map((share, index) => [share.id, index]));
  let subtotalCents = 0;
  for (const item of items) {
    const amount = Number(item.amountCents);
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Each item must have a valid amount in whole cents.');
    const participantIds = [...new Set(item.participantIds || [])].filter((id) => peopleById.has(id));
    if (!participantIds.length) throw new Error('Every item must be assigned to at least one person.');
    subtotalCents += amount;
    const base = Math.floor(amount / participantIds.length);
    let remainder = amount % participantIds.length;
    participantIds.forEach((id) => {
      shares[shareIndex.get(id)].baseCents += base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    });
  }
  const taxCents = Math.round(subtotalCents * taxRate / 100);
  const tipCents = Math.round(subtotalCents * tipRate / 100);
  const taxShares = allocateProportionally(taxCents, shares.map((share) => share.baseCents));
  const tipShares = allocateProportionally(tipCents, shares.map((share) => share.baseCents));
  shares.forEach((share, index) => {
    share.taxCents = taxShares[index];
    share.tipCents = tipShares[index];
    share.totalCents = share.baseCents + share.taxCents + share.tipCents;
  });
  return { subtotalCents, taxCents, tipCents, totalCents: subtotalCents + taxCents + tipCents, people: shares };
}
export function formatMoney(cents, currency = 'GBP') {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}
