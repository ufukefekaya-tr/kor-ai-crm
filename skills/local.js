// Copyright 2026 Ufuk Efe Kaya. SPDX-License-Identifier: MIT OR Apache-2.0.
// Explicit local utility library. No evaluation, IO or automatic chat execution.
const functions = Object.freeze({
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor,
  ceil: Math.ceil, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  log: Math.log10, ln: Math.log, min: Math.min, max: Math.max,
});

export function calculate(expression) {
  if (typeof expression !== 'string' || !expression.trim() || expression.length > 512) throw new Error('Expression must contain 1–512 characters');
  const input = expression.trim().toLowerCase();
  const tokens = [];
  let offset = 0;
  while (offset < input.length) {
    const match = /^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[+\-*/^%(),])/.exec(input.slice(offset));
    if (!match) throw new Error('Invalid expression character');
    offset += match[0].length;
    if (match[0].trim()) tokens.push(match[0]);
    if (tokens.length > 256) throw new Error('Too many tokens');
  }
  let index = 0;
  let depth = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function finite(value) {
    if (!Number.isFinite(value)) throw new Error('Result must be finite');
    return value;
  }
  function atom() {
    if (++depth > 32) throw new Error('Expression nesting exceeds 32');
    let value;
    const token = take();
    if (token === '(') {
      value = sum();
      if (take() !== ')') throw new Error('Missing closing parenthesis');
    } else if (token === 'pi') value = Math.PI;
    else if (token === 'e') value = Math.E;
    else if (Object.hasOwn(functions, token)) {
      if (take() !== '(') throw new Error('Function requires parentheses');
      const args = [sum()];
      while (peek() === ',') { take(); args.push(sum()); }
      if (take() !== ')') throw new Error('Missing function parenthesis');
      if (!['min', 'max'].includes(token) && args.length !== 1) throw new Error('Function requires one argument');
      value = functions[token](...args);
    } else if (token && /^(?:\d|\.\d)/.test(token)) value = Number(token);
    else throw new Error('Expected a number, constant or allowed function');
    while (peek() === '%') { take(); value /= 100; }
    depth--;
    return finite(value);
  }
  function power() { const left = atom(); return peek() === '^' ? (take(), finite(left ** unary())) : left; }
  function unary() {
    if (++depth > 32) throw new Error('Expression nesting exceeds 32');
    let value;
    if (peek() === '+') { take(); value = unary(); }
    else if (peek() === '-') { take(); value = -unary(); }
    else value = power();
    depth--;
    return finite(value);
  }
  function product() {
    let value = unary();
    while (['*', '/'].includes(peek())) { const op = take(); const right = unary(); value = finite(op === '*' ? value * right : value / right); }
    return value;
  }
  function sum() {
    let value = product();
    while (['+', '-'].includes(peek())) { const op = take(); const right = product(); value = finite(op === '+' ? value + right : value - right); }
    return value;
  }
  const value = sum();
  if (index !== tokens.length) throw new Error('Unexpected token');
  return value;
}

export function getTime(timezone = 'UTC', now = new Date()) {
  if (typeof timezone !== 'string' || timezone.length > 100) throw new Error('Invalid timezone');
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid clock value');
  const formatter = new Intl.DateTimeFormat('en-GB', {timeZone: timezone, dateStyle: 'full', timeStyle: 'long'});
  return {iso: date.toISOString(), timezone, local: formatter.format(date)};
}
