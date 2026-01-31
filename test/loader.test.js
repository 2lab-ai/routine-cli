import test from 'node:test';
import assert from 'node:assert/strict';
import { parse as parseYaml } from 'yaml';

import { generateTemplate } from '../src/loader.js';

test('generateTemplate: output is valid YAML', () => {
  const content = generateTemplate('my-routine');
  const parsed = parseYaml(content);
  
  assert.equal(parsed.name, 'my-routine');
  assert.ok(Array.isArray(parsed.steps));
  assert.ok(parsed.steps.length > 0);
});

test('generateTemplate: escapes YAML injection attempts', () => {
  // This input would cause YAML injection without proper escaping
  const malicious = 'test: injection\nsteps:\n  - evil';
  const content = generateTemplate(malicious);
  const parsed = parseYaml(content);
  
  // Name should be the literal string, not parsed as YAML structure
  assert.equal(parsed.name, malicious);
  // Steps should still be the template steps, not injected
  assert.ok(Array.isArray(parsed.steps));
  assert.equal(parsed.steps[0].name, 'hello');
});

test('generateTemplate: handles special characters safely', () => {
  const cases = [
    'name with spaces',
    'name"with"quotes',
    "name'single'quotes",
    'name\twith\ttabs',
    'name\\with\\backslash',
  ];
  
  for (const name of cases) {
    const content = generateTemplate(name);
    const parsed = parseYaml(content);
    assert.equal(parsed.name, name, `Failed for: ${name}`);
  }
});
