const fs = require('fs');
let testCode = fs.readFileSync('src/test/project-structure-boundaries.test.ts', 'utf8');

testCode = testCode.replace(
  /expect\(inboxRuntime\)\.not\.toMatch\(\/\\\\bany\\\\b\/\);/g,
  'expect(inboxRuntime).not.toMatch(/\\\\bany\\\\b/);'
);

testCode = testCode.replace(
  /expect\(attentionRuntime\)\.not\.toMatch\(\/\\\\bany\\\\b\/\);/g,
  'expect(attentionRuntime).not.toMatch(/\\\\bany\\\\b/);'
);

fs.writeFileSync('src/test/project-structure-boundaries.test.ts', testCode);
