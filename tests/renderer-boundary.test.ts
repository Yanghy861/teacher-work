import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'

import { describe, expect, it } from 'vitest'

const rendererDirectory = fileURLToPath(new URL('../src/renderer', import.meta.url))
const forbiddenGlobals = new Set([
  'process',
  'Buffer',
  'require',
  'module',
  'exports',
  'global',
  '__dirname',
  '__filename',
  'setImmediate',
  'clearImmediate',
  'NodeJS',
])
const forbiddenBareModules = new Set([
  'electron',
  'fs',
  'path',
  'os',
  'crypto',
  'child_process',
  'better-sqlite3',
  'sqlite3',
])

function rendererSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      return rendererSourceFiles(entryPath)
    }
    return /\.(?:ts|tsx|css|html)$/.test(entry.name) ? [entryPath] : []
  })
}

function inspectTypeScriptSource(filePath: string, contents: string): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    contents,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const requireAliases = collectRequireAliases(sourceFile)
  const violations: string[] = []

  function report(message: string): void {
    violations.push(filePath + ': ' + message)
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const moduleName = getStringLiteral(node.moduleSpecifier)
      if (moduleName !== undefined && isForbiddenModule(moduleName)) {
        report('forbidden static import ' + moduleName)
      }
    }

    if (ts.isImportEqualsDeclaration(node)) {
      report('import equals is forbidden')
    }

    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        report('dynamic import is forbidden')
      }
      if (ts.isIdentifier(node.expression) && requireAliases.has(node.expression.text)) {
        report('require is forbidden')
      }
    }

    if (ts.isIdentifier(node) && forbiddenGlobals.has(node.text) && !isPropertyName(node)) {
      report('forbidden Node global ' + node.text)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...new Set(violations)]
}

function collectRequireAliases(sourceFile: ts.SourceFile): Set<string> {
  const aliases = new Set(['require'])

  function visit(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isIdentifier(node.initializer) &&
      aliases.has(node.initializer.text)
    ) {
      aliases.add(node.name.text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return aliases
}

function getStringLiteral(node: ts.Node): string | undefined {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : undefined
}

function isForbiddenModule(moduleName: string): boolean {
  const normalized = moduleName.replace(/\\/g, '/')
  return (
    moduleName.startsWith('node:') ||
    forbiddenBareModules.has(moduleName) ||
    /(^|\/)main(\/|$)/.test(normalized)
  )
}

function isPropertyName(node: ts.Identifier): boolean {
  const parent = node.parent
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    (ts.isPropertySignature(parent) && parent.name === node) ||
    (ts.isMethodDeclaration(parent) && parent.name === node) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node) ||
    (ts.isModuleDeclaration(parent) && parent.name === node)
  )
}

describe('renderer process boundary', () => {
  it('does not import Node, Electron, Main, or database APIs directly', () => {
    const violations = rendererSourceFiles(rendererDirectory)
      .filter((filePath) => /\.(?:ts|tsx)$/.test(filePath))
      .flatMap((filePath) => inspectTypeScriptSource(filePath, readFileSync(filePath, 'utf8')))

    expect(violations).toEqual([])
  })

  it('detects static, side-effect, dynamic, aliased require, and Node-global forms', () => {
    const fixture = [
      "import 'node:fs'",
      "import fs from 'fs'",
      "const dynamicallyLoaded = import('node:path')",
      "const loaded = require('electron')",
      'const load = require',
      "load('better-sqlite3')",
      'process.env.SECRET',
      'Buffer.from("secret")',
      'global.setImmediate(() => undefined)',
      '__dirname',
    ].join('\n')
    const violations = inspectTypeScriptSource('renderer-fixture.ts', fixture)

    expect(violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('node:fs'),
        expect.stringContaining('forbidden static import fs'),
        expect.stringContaining('dynamic import is forbidden'),
        expect.stringContaining('require is forbidden'),
        expect.stringContaining('forbidden Node global process'),
        expect.stringContaining('forbidden Node global Buffer'),
        expect.stringContaining('forbidden Node global global'),
        expect.stringContaining('forbidden Node global __dirname'),
      ]),
    )
  })
})
