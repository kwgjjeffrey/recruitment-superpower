#!/usr/bin/env node
import {tsImport} from 'tsx/esm/api';
try {
  const {runPageCommand}=await tsImport('./run_page_command.ts',import.meta.url);
  await runPageCommand(process.argv[2]??'check',process.cwd());
} catch(error) {console.error(error instanceof Error?error.message:String(error));process.exitCode=1;}
