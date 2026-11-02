#!/usr/bin/env node
// Validate branding/product.json against the Thaumoctopus product baseline.
// Usage: node scripts/thaumoctopus/set-brand.mjs --check

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const productPath = join(repoRoot, 'branding', 'product.json')

const REQUIRED_FIELDS = [
  'productName',
  'chineseProductName',
  'shortName',
  'internalName',
  'packageScope',
  'vendor',
  'version',
  'supportUrl',
  'siteUrl',
  'controlPlaneUrl',
  'registryUrl',
  'defaultProfile',
  'locale',
]

const URL_FIELDS = ['supportUrl', 'siteUrl', 'controlPlaneUrl', 'registryUrl']

let failures = 0
function fail(message) {
  console.error(`set-brand: ${message}`)
  failures += 1
}

let product
try {
  product = JSON.parse(readFileSync(productPath, 'utf8'))
} catch (error) {
  fail(`cannot read ${productPath}: ${error.message}`)
  process.exit(1)
}

for (const field of REQUIRED_FIELDS) {
  const value = product[field]
  if (typeof value !== 'string' || value.length === 0) {
    fail(`product.json is missing the string field "${field}"`)
  }
}

for (const field of URL_FIELDS) {
  const value = product[field]
  if (typeof value === 'string' && value.length > 0) {
    try {
      new URL(value)
    } catch {
      fail(`product.json field "${field}" is not a valid URL: ${value}`)
    }
  }
}

if (product.packageScope !== '@thaumoctopus') {
  fail(`product.json packageScope must be "@thaumoctopus", got ${JSON.stringify(product.packageScope)}`)
}

if (product.theme?.logo !== './logo.svg') {
  fail('product.json theme.logo must point at "./logo.svg"')
}

if (failures > 0) {
  process.exit(1)
}

console.log(`set-brand: ${product.productName} (${product.chineseProductName}) v${product.version} matches the product baseline`)
