#!/usr/bin/env node

import { runCLI } from "../src/cli.js";

runCLI(process.argv.slice(2)).catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
