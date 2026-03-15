import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeQuery } from "../src/utils/normalize.js";

test("normalizeQuery: plain term passes through", () => {
  assert.equal(normalizeQuery("rice"), "rice");
});

test("normalizeQuery: strips 'cheap'", () => {
  assert.equal(normalizeQuery("cheap rice"), "rice");
});

test("normalizeQuery: strips 'cheapest' and 'near me'", () => {
  assert.equal(normalizeQuery("cheapest rice near me"), "rice");
});

test("normalizeQuery: strips 'where can i get'", () => {
  assert.equal(normalizeQuery("where can i get rice"), "rice");
});

test("normalizeQuery: preserves 'and' conjunction", () => {
  assert.equal(normalizeQuery("I want chicken and cooking oil"), "chicken and cooking oil");
});

test("normalizeQuery: strips 'find me cheapest' and 'near me'", () => {
  assert.equal(normalizeQuery("find me cheapest chicken and cooking oil near me"), "chicken and cooking oil");
});

test("normalizeQuery: strips 'show me' and 'prices'", () => {
  assert.equal(normalizeQuery("show me chicken and cooking oil prices"), "chicken and cooking oil");
});

test("normalizeQuery: strips 'i need'", () => {
  assert.equal(normalizeQuery("i need chicken and cooking oil"), "chicken and cooking oil");
});

test("normalizeQuery: strips 'help me find'", () => {
  assert.equal(normalizeQuery("help me find milk"), "milk");
});

test("normalizeQuery: strips 'what's the price of'", () => {
  assert.equal(normalizeQuery("what's the price of milk"), "milk");
});

test("normalizeQuery: strips 'how much does ... cost'", () => {
  assert.equal(normalizeQuery("how much does milk cost"), "milk");
});

test("normalizeQuery: strips 'lowest price for' and 'near me'", () => {
  assert.equal(normalizeQuery("lowest price for bread near me"), "bread");
});

test("normalizeQuery: strips 'i would like to buy'", () => {
  assert.equal(normalizeQuery("i would like to buy eggs"), "eggs");
});

test("normalizeQuery: strips 'find the cheapest' and 'close to me'", () => {
  assert.equal(normalizeQuery("find the cheapest cooking oil close to me"), "cooking oil");
});

test("normalizeQuery: strips 'get me some' and 'please'", () => {
  assert.equal(normalizeQuery("get me some cooking oil please"), "cooking oil");
});

test("normalizeQuery: strips 'i am searching for'", () => {
  assert.equal(normalizeQuery("i am searching for flour"), "flour");
});

test("normalizeQuery: strips 'do you have'", () => {
  assert.equal(normalizeQuery("do you have cooking oil"), "cooking oil");
});

test("normalizeQuery: handles extra whitespace and mixed case", () => {
  assert.equal(normalizeQuery("  CHEAPEST   Rice  Near  Me  "), "rice");
});
