import { test } from '../extension-kit/lib/test.mjs'
const filter = process.argv[2]
await test('bike', filter)
