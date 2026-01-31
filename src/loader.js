import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { validateRoutine } from './schema.js';

/**
 * Load and validate a routine file (YAML or JSON)
 * @param {string} filePath - Path to routine file
 * @returns {{ success: boolean, data?: object, errors?: string[] }}
 */
export function loadRoutine(filePath) {
  // Check file exists
  if (!existsSync(filePath)) {
    return { success: false, errors: [`File not found: ${filePath}`] };
  }
  
  // Read file
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { success: false, errors: [`Failed to read file: ${err.message}`] };
  }
  
  // Parse based on extension
  let parsed;
  const ext = filePath.toLowerCase();
  
  try {
    if (ext.endsWith('.json')) {
      parsed = JSON.parse(content);
    } else if (ext.endsWith('.yaml') || ext.endsWith('.yml')) {
      parsed = parseYaml(content);
    } else {
      // Try YAML first (superset of JSON)
      parsed = parseYaml(content);
    }
  } catch (err) {
    return { success: false, errors: [`Parse error: ${err.message}`] };
  }
  
  // Validate against schema
  return validateRoutine(parsed);
}

/**
 * Sanitize a string for safe YAML embedding
 * @param {string} str - Input string
 * @returns {string} YAML-safe quoted string
 */
function yamlSafe(str) {
  // Use JSON.stringify to get a properly escaped string, which is valid YAML
  return JSON.stringify(String(str));
}

/**
 * Generate a routine template
 * @param {string} name - Routine name
 * @returns {string} YAML content
 */
export function generateTemplate(name) {
  const safeName = yamlSafe(name);
  return `name: ${safeName}
description: My routine

steps:
  - name: hello
    type: exec
    command: echo "Hello from routine!"
    
  - name: pause
    type: sleep
    duration: 1000
    
  - name: done
    type: exec
    command: echo "Routine complete!"
`;
}
