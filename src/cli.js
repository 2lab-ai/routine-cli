#!/usr/bin/env node

import { writeFileSync, readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { loadRoutine, generateTemplate } from './loader.js';
import { runRoutine } from './runner.js';

const VERSION = '0.1.0';

const HELP = `clawd-ogm v${VERSION} - Minimal routine runner CLI

USAGE:
  clawd-ogm <command> [options]

COMMANDS:
  init [name]       Create a new routine file (default: my-routine.yaml)
  validate <file>   Validate a routine file
  list [dir]        List routine files in directory (default: .)
  run <file>        Execute a routine file

OPTIONS:
  -h, --help        Show this help
  -v, --version     Show version

EXIT CODES:
  0 - Success (all steps passed)
  1 - Routine execution failed (one or more steps failed)
  2 - Invalid routine file or usage error

EXAMPLES:
  clawd-ogm init my-task
  clawd-ogm validate routines/deploy.yaml
  clawd-ogm run routines/deploy.yaml
  clawd-ogm list ./routines
`;

function printHelp() {
  console.log(HELP);
  process.exit(0);
}

function printVersion() {
  console.log(`clawd-ogm v${VERSION}`);
  process.exit(0);
}

/**
 * init command - Create a new routine file
 */
function cmdInit(args) {
  const name = args[0] || 'my-routine';
  const filename = name.endsWith('.yaml') ? name : `${name}.yaml`;
  const filepath = resolve(filename);
  
  if (existsSync(filepath)) {
    console.error(`Error: File already exists: ${filepath}`);
    process.exit(1);
  }
  
  const content = generateTemplate(name.replace('.yaml', ''));
  writeFileSync(filepath, content);
  console.log(`Created: ${filepath}`);
  console.log(`\nEdit the file, then run: clawd-ogm run ${filename}`);
}

/**
 * validate command - Validate a routine file
 */
function cmdValidate(args) {
  if (!args[0]) {
    console.error('Error: Missing file argument');
    console.error('Usage: clawd-ogm validate <file>');
    process.exit(2);
  }
  
  const filepath = resolve(args[0]);
  const result = loadRoutine(filepath);
  
  if (result.success) {
    console.log(`✓ Valid routine: ${result.data.name}`);
    console.log(`  Steps: ${result.data.steps.length}`);
    result.data.steps.forEach((step, i) => {
      console.log(`  ${i + 1}. ${step.name} (${step.type})`);
    });
    process.exit(0);
  } else {
    console.error(`✗ Invalid routine: ${filepath}`);
    result.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(2);
  }
}

/**
 * list command - List routine files
 */
function cmdList(args) {
  const dir = resolve(args[0] || '.');
  
  if (!existsSync(dir)) {
    console.error(`Error: Directory not found: ${dir}`);
    process.exit(1);
  }
  
  const files = readdirSync(dir).filter(f => 
    f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.json')
  );
  
  if (files.length === 0) {
    console.log(`No routine files found in ${dir}`);
    console.log('Routine files have extension: .yaml, .yml, or .json');
    process.exit(0);
  }
  
  console.log(`Routines in ${dir}:\n`);
  
  for (const file of files) {
    const filepath = join(dir, file);
    const result = loadRoutine(filepath);
    
    if (result.success) {
      console.log(`  ✓ ${file}`);
      console.log(`    Name: ${result.data.name}`);
      console.log(`    Steps: ${result.data.steps.length}`);
    } else {
      console.log(`  ✗ ${file} (invalid)`);
    }
    console.log('');
  }
}

/**
 * run command - Execute a routine
 */
async function cmdRun(args) {
  if (!args[0]) {
    console.error('Error: Missing file argument');
    console.error('Usage: clawd-ogm run <file>');
    process.exit(2);
  }
  
  const filepath = resolve(args[0]);
  const result = loadRoutine(filepath);
  
  if (!result.success) {
    console.error(`✗ Invalid routine: ${filepath}`);
    result.errors.forEach(err => console.error(`  - ${err}`));
    process.exit(2);
  }
  
  console.log('');
  const runResult = await runRoutine(result.data, filepath);
  
  process.exit(runResult.success ? 0 : 1);
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
  }
  
  if (args.includes('-v') || args.includes('--version')) {
    printVersion();
  }
  
  const [command, ...rest] = args;
  
  switch (command) {
    case 'init':
      cmdInit(rest);
      break;
    case 'validate':
      cmdValidate(rest);
      break;
    case 'list':
      cmdList(rest);
      break;
    case 'run':
      await cmdRun(rest);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "clawd-ogm --help" for usage');
      process.exit(2);
  }
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
